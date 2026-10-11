/**
 * 이미지 1장 차감 — 통합 helper.
 *
 * 우선순위:
 *   1. 월구독 한도 (있는 경우 + 미소진)
 *   2. 활성 장수 팩 (FIFO by expires_at, atomic RPC)
 *   3. 부족 → 402 INSUFFICIENT_PACK
 *
 * 사용처: /api/render/create-job 의 각 핸들러에서 job insert 직전 1회 호출.
 *
 * 주의 — atomic 책임 분담:
 *   - 월구독 한도: incrementBrandGenerationCount() (이미 organization
 *     usage_counters 에 atomic upsert)
 *   - 팩 차감: consume_from_pack RPC (FOR UPDATE SKIP LOCKED 로 직렬화)
 *
 * 환불 (Phase 2, 2026-05-15):
 *   차감 후 R2 업로드 / job insert 가 실패하면 1장이 누수된다. 이를 보상하기
 *   위해 ConsumeOk 에 source 별 식별자(brandId / packId) 를 포함시키고,
 *   refundOneGeneration() 으로 best-effort 환불을 제공한다. 호출자는 차감 후
 *   실패 경로에서 반드시 refundOneGeneration 을 호출해야 한다.
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 2.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getBrandSubscription,
  getBrandGenerationCount,
  getBrandDailyGenerationCount,
  incrementBrandGenerationCount,
  decrementBrandGenerationCount,
} from '@/lib/brandSubscription';

export type GenerationSource = 'subscription' | 'pack';

/**
 * 성공 시 환불 helper 가 어디로 되돌릴지 식별할 정보를 함께 반환한다.
 *
 * - subscription: 월구독 카운터에 -1 (brandId 로 org 조회).
 * - pack:         차감된 pack row 의 id 로 refund_to_pack RPC 호출.
 *
 * brandId 가 없는 legacy 흐름은 source: 'subscription', brandId: null —
 * refundOneGeneration 이 자동으로 noop 처리한다.
 */
export type ConsumeOk =
  | { ok: true; source: 'subscription'; brandId: string | null }
  | { ok: true; source: 'pack'; packId: string };

export type ConsumeResult =
  | ConsumeOk
  | { ok: false; error: string; status: number; code?: 'DAILY_LIMIT' | 'INSUFFICIENT_PACK' };

/**
 * 1장 차감.
 *
 * @param brandId  null 이면 차감 없이 통과 (brand 없는 legacy 흐름).
 *                 정상 흐름에서는 항상 brandId 가 있어야 한다.
 */
export async function consumeOneGeneration(
  brandId: string | null,
): Promise<ConsumeResult> {
  // brand 없는 흐름은 한도/팩 모두 적용 불가 — 통과.
  if (!brandId) return { ok: true, source: 'subscription', brandId: null };

  const sub = await getBrandSubscription(brandId);

  // ── Case 1: 월간 한도 무제한 (studio/pro 등) ────────────────────────────
  // 이 경우 generationLimit === null. dailyLimit 만 확인.
  // 일일 한도 초과는 "오늘은 그만" 의미 — 팩 fallback 미적용.
  if (sub.generationLimit === null) {
    if (sub.plan.dailyLimit !== null) {
      const dailyCount = await getBrandDailyGenerationCount(brandId);
      if (dailyCount >= sub.plan.dailyLimit) {
        return {
          ok: false,
          error: `오늘의 이미지 생성 한도(${sub.plan.dailyLimit}장)에 도달했습니다. 내일 다시 시도해주세요.`,
          status: 429,
          code: 'DAILY_LIMIT',
        };
      }
    }
    await incrementBrandGenerationCount(brandId);
    return { ok: true, source: 'subscription', brandId };
  }

  // ── Case 2: 월간 한도 존재 (free/starter/quick_plus/label) ──────────────
  // 한도 미소진 → 월구독에서 차감.
  const currentCount = await getBrandGenerationCount(brandId);
  if (currentCount < sub.generationLimit) {
    await incrementBrandGenerationCount(brandId);
    return { ok: true, source: 'subscription', brandId };
  }

  // ── Case 3: 월간 한도 소진 → 팩 fallback ────────────────────────────────
  // brand → org_id 매핑이 없으면 (마이그레이션 직후 예외 케이스) 팩 사용 불가.
  if (!sub.organizationId) {
    return {
      ok: false,
      error: '이번 달 한도를 모두 사용했습니다. 플랜 업그레이드가 필요합니다.',
      status: 402,
      code: 'INSUFFICIENT_PACK',
    };
  }

  const { data: consumedPackId, error: rpcErr } = await supabaseAdmin.rpc(
    'consume_from_pack',
    { p_org_id: sub.organizationId },
  );

  if (rpcErr) {
    console.error(
      '[consumeOneGeneration] consume_from_pack RPC error:',
      rpcErr.message,
      'org_id=',
      sub.organizationId,
    );
    return {
      ok: false,
      error: '이미지 차감 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      status: 500,
    };
  }

  // consume_from_pack 는 uuid 또는 null 반환 (2026-05-15 시그니처 변경).
  if (typeof consumedPackId === 'string' && consumedPackId.length > 0) {
    return { ok: true, source: 'pack', packId: consumedPackId };
  }

  // 잔량 0 또는 모든 팩 만료
  return {
    ok: false,
    error: '이미지가 부족합니다. 이미지를 충전하거나 플랜을 업그레이드하세요.',
    status: 402,
    code: 'INSUFFICIENT_PACK',
  };
}

/**
 * 차감 1장 환불 — best-effort.
 *
 * 호출 시점:
 *   consumeOneGeneration 성공 후 R2 업로드 또는 job insert 가 실패한 경우.
 *   사용자에게는 동일한 500 에러를 반환하되, 차감된 1장은 이 helper 가 백그라운드로
 *   복원한다. 환불 자체가 실패해도 사용자 흐름은 막지 않는다 (운영자 개입 신호).
 *
 * 멱등성:
 *   - subscription: usage_counters.generations >= 1 일 때만 -1, 음수 clamp.
 *   - pack:         remaining_count + 1 <= initial_count 일 때만 +1.
 *   동일 ConsumeOk 로 두 번 호출되어도 두 번째는 noop (DB 가드).
 *
 * 절대 throw 하지 않는다. 호출자가 try-catch 로 감쌀 필요 없음.
 */
export async function refundOneGeneration(consume: ConsumeOk): Promise<void> {
  try {
    if (consume.source === 'subscription') {
      if (!consume.brandId) {
        // brand 없는 legacy 흐름은 차감도 안 했으므로 환불도 noop.
        return;
      }
      await decrementBrandGenerationCount(consume.brandId);
      return;
    }

    // pack 환불 — refund_to_pack RPC.
    const { data: refunded, error: rpcErr } = await supabaseAdmin.rpc(
      'refund_to_pack',
      { p_pack_id: consume.packId },
    );
    if (rpcErr) {
      console.error(
        '[refundOneGeneration] refund_to_pack RPC error — manual recovery may be required',
        { packId: consume.packId, error: rpcErr.message },
      );
      return;
    }
    if (refunded !== true) {
      // false 반환은 "이미 환불됐거나 initial_count 가 잘못 기록된 상태".
      // 정상 흐름에서는 거의 없어야 한다.
      console.warn(
        '[refundOneGeneration] refund_to_pack returned false — already refunded or invalid state',
        { packId: consume.packId },
      );
    }
  } catch (err) {
    // best-effort: 어떤 예외도 호출자 흐름을 막지 않는다. critical 로그만 남긴다.
    console.error(
      '[refundOneGeneration] unexpected error — manual recovery may be required',
      { consume, error: err instanceof Error ? err.message : String(err) },
    );
  }
}
