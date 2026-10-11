/**
 * POST /api/packs/krw/webhook
 *
 * PortOne V1 Webhook — 결제 상태가 변경될 때 PortOne 이 서버-서버로 push.
 *
 * Goal (H-1 대응):
 *   클라이언트 redirect 가 실패해도 (모바일 백그라운드 / 네트워크 끊김 /
 *   브라우저 강제 종료) PortOne webhook 이 정산을 트리거해 결제 누락 차단.
 *   `/complete` 와 정확히 같은 settlePackOrder 헬퍼를 호출해 결과 일관성 보장.
 *
 * PortOne V1 webhook spec:
 *   - POST body (application/json):
 *       { imp_uid: string, merchant_uid: string,
 *         status: 'paid' | 'failed' | 'cancelled' | 'ready' }
 *   - 서명 헤더 없음. 검증은 `getPaymentInfo(imp_uid)` 로 PG 상태 재확인.
 *     (settlePackOrder 내부에서 PortOne API 를 다시 호출하므로 위변조 불가.)
 *   - 응답 200 만 PortOne 이 성공으로 간주. 4xx/5xx 면 최대 5회 재시도.
 *
 * 응답 정책:
 *   - 정상 정산 / 멱등 hit → 200 (PortOne 종료)
 *   - 외부 시스템 일시 장애 (PortOne API 503, DB 일시 오류, RACE_NO_PACK)
 *     → 5xx (PortOne 재시도 유도 — 재시도 중에 race 가 자연스럽게 해결될 가능성)
 *   - 비즈니스 실패 (AMOUNT_MISMATCH, MERCHANT_MISMATCH, WRONG_STATUS,
 *     NOT_PAID, ORDER_NOT_FOUND) → 200 (재시도해도 결과 동일 — 무한 재시도 방지,
 *     별도 운영 알람 채널로 처리)
 *   - 다른 PG/플로우의 webhook 이 잘못 매핑된 경우 (merchant_uid prefix
 *     불일치) → 200 (무시)
 *
 * 보안:
 *   - PortOne 은 webhook 서명 헤더를 제공하지 않음. 따라서 body 의 내용은
 *     "trigger" 로만 사용하고, 실제 amount/status/merchant_uid 검증은
 *     `getPaymentInfo(impUid)` 응답으로 수행 (settlePackOrder 내부).
 *   - body 의 imp_uid 만 신뢰. 나머지 (status, merchant_uid) 는 PortOne API
 *     응답으로 재확인.
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 2.1.
 */

import { NextResponse } from 'next/server';
import { settlePackOrder } from '@/lib/packSettlement';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MERCHANT_UID_PREFIX = 'krw-pack-';

type WebhookBody = {
  imp_uid?: unknown;
  merchant_uid?: unknown;
  status?: unknown;
};

type WebhookStatus = 'paid' | 'failed' | 'cancelled' | 'ready';

/**
 * 200 ack — PortOne 콘솔에서 success 처리, 재시도 중단.
 * body 는 PortOne 콘솔 표시용 정보 (PII 미포함).
 */
function ack(message: string): NextResponse {
  return NextResponse.json({ received: true, message }, { status: 200 });
}

/**
 * 5xx — PortOne 재시도 유도. 최대 5회까지 자연 재시도.
 */
function retry(message: string): NextResponse {
  return NextResponse.json({ received: false, message }, { status: 503 });
}

/**
 * Body 파싱. application/json 우선, 실패 시 빈 객체.
 * PortOne V1 은 JSON 으로 발송하므로 form-urlencoded fallback 은 두지 않는다.
 */
async function parseBody(req: Request): Promise<WebhookBody | null> {
  try {
    return (await req.json()) as WebhookBody;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await parseBody(req);
  if (!body) {
    console.warn('[packs/webhook] invalid JSON body');
    // 잘못된 JSON → PortOne 이 재시도해도 의미 없음 → 200 ack.
    return ack('invalid body');
  }

  const impUid = typeof body.imp_uid === 'string' ? body.imp_uid.trim() : '';
  const merchantUid =
    typeof body.merchant_uid === 'string' ? body.merchant_uid.trim() : '';
  const rawStatus = typeof body.status === 'string' ? body.status.trim() : '';

  if (!impUid || !merchantUid) {
    console.warn('[packs/webhook] missing imp_uid or merchant_uid', {
      impUid,
      merchantUid,
    });
    return ack('missing fields');
  }

  // 다른 PG / 플로우의 webhook 이 잘못 매핑된 경우 — 200 ack 후 무시.
  if (!merchantUid.startsWith(MERCHANT_UID_PREFIX)) {
    console.log('[packs/webhook] non-pack merchant_uid, ignoring', {
      merchantUid,
      impUid,
    });
    return ack('ignored: not a pack order');
  }

  const status = rawStatus as WebhookStatus;

  // ── status === 'ready' — PortOne 결제창 진입 알림. 무시. ────────────────
  if (status === 'ready') {
    console.log('[packs/webhook] ready event, ignoring', { merchantUid, impUid });
    return ack('ready');
  }

  // ── status === 'failed' | 'cancelled' — pending row 만 failed 로 마킹 ──
  // 이미 paid 인 row 는 건드리지 않는다 (refund 는 별도 흐름).
  if (status === 'failed' || status === 'cancelled') {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('krw_pack_orders')
      .update({ status: 'failed' })
      .eq('merchant_uid', merchantUid)
      .eq('status', 'pending')
      .is('pg_tid', null) // paid 흐름이 시작된 row(pg_tid 채워진 것)는 위조 webhook 으로부터 보호
      .select('id');

    if (updateErr) {
      console.error('[packs/webhook] failed/cancelled update error', {
        merchantUid,
        impUid,
        status,
        message: updateErr.message,
      });
      // DB 일시 오류 → PortOne 재시도 유도.
      return retry('db error');
    }

    console.log('[packs/webhook] marked failed', {
      merchantUid,
      impUid,
      status,
      updatedCount: updated?.length ?? 0,
    });
    return ack(`marked failed (${updated?.length ?? 0})`);
  }

  // ── status === 'paid' — 정산 위임 ──────────────────────────────────────
  if (status === 'paid') {
    const result = await settlePackOrder({
      merchantUid,
      impUid,
      caller: 'webhook',
    });

    if (result.ok) {
      console.log('[packs/webhook] settled', {
        merchantUid,
        impUid,
        orderId: result.orderId,
        idempotent: result.idempotent,
        packId: result.pack.id,
      });
      return ack(result.idempotent ? 'already settled' : 'settled');
    }

    // 실패 분기 — code 별 재시도 여부 결정.
    console.warn('[packs/webhook] settlement failed', {
      merchantUid,
      impUid,
      orderId: result.orderId,
      code: result.code,
      status: result.status,
    });

    switch (result.code) {
      case 'VERIFY_FAILED':       // PortOne API 일시 장애
      case 'ORDER_LOOKUP_FAILED': // DB 일시 장애
      case 'ORDER_UPDATE_FAILED': // DB 일시 장애
      case 'RACE_NO_PACK':        // race window — 재시도하면 해결될 가능성
      case 'PACK_INSERT_FAILED':  // 운영 알람 + 재시도로 self-heal 가능성
        return retry(`retry: ${result.code}`);

      case 'ORDER_NOT_FOUND':    // 다른 environment / 잘못 매핑된 webhook
      case 'WRONG_STATUS':       // already failed/refunded
      case 'NOT_PAID':           // PortOne 상에서도 paid 아님
      case 'AMOUNT_MISMATCH':    // 위변조 의심 — 재시도해도 동일
      case 'MERCHANT_MISMATCH':  // 위변조 의심 — 재시도해도 동일
        return ack(`ignored: ${result.code}`);

      default: {
        // 타입스크립트 exhaustiveness 보장. 새 code 추가 시 컴파일 에러.
        const _exhaustive: never = result.code;
        void _exhaustive;
        return retry('unknown');
      }
    }
  }

  // ── 알 수 없는 status — 로그 후 200 ack ───────────────────────────────
  console.warn('[packs/webhook] unknown status, ignoring', {
    merchantUid,
    impUid,
    status: rawStatus,
  });
  return ack(`ignored: unknown status ${rawStatus}`);
}
