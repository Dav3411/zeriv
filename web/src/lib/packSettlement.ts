/**
 * 팩 결제 정산 헬퍼 — `/api/packs/krw/complete` 와 `/api/packs/krw/webhook` 공유.
 *
 * Goal:
 *   클라이언트 redirect 실패 (모바일 백그라운드 / 네트워크 끊김 / 브라우저 close)
 *   시에도 PortOne webhook 으로 동일한 정산 경로를 실행해 결제 누락(H-1) 차단.
 *
 * 책임 경계:
 *   - 본 함수: PortOne 검증 + `pending → paid` atomic 전이 + `org_generation_packs` insert
 *     + 멱등 응답 (이미 paid 인 order 도 안전하게 재호출 가능)
 *   - 호출자 책임:
 *       * `/complete`: 사용자 인증 + `order.user_id === userId` 일치 검증
 *       * `/webhook`: PortOne 서버-서버 호출이므로 ownership 검증 없음
 *         (둘 다 `order` 는 DB 의 `merchant_uid` 로 검증되므로 위변조 불가)
 *
 * Race 처리:
 *   `/complete` 와 `/webhook` 가 동시에 같은 `merchant_uid` 로 도착하는 경우.
 *   둘 다 PortOne API 를 부르고 paid 응답을 받은 뒤, 한 호출이 `WHERE status='pending'`
 *   UPDATE 에 성공, 다른 하나는 0건이 된다. 0건이 된 호출은 다른 호출이 만든 pack 을
 *   `source_ref_id` 로 역참조해 idempotent 응답을 만들어야 하는데, 첫 호출이
 *   "UPDATE 직후 / pack insert 직전" 사이의 좁은 window 에 있다면 두 번째 호출의
 *   lookup 이 빈 결과를 받을 수 있다. 이 좁은 window 에 대비해 짧은 backoff 로 재조회.
 *   (재조회 시 PortOne API 는 재호출하지 않는다 — DB lookup 만.)
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 2.1.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPaymentInfo } from '@/lib/portone';
import { captureBillingIncident } from '@/lib/sentry';

// ─── Types ───────────────────────────────────────────────────────────────

export type PackResultPack = {
  id: string;
  remaining_count: number;
  initial_count: number;
  expires_at: string | null;
};

export type SettlePackOk = {
  ok: true;
  /** 이미 처리됐던 order 또는 race 로 다른 호출이 처리한 경우 true. */
  idempotent: boolean;
  orderId: string;
  pack: PackResultPack;
};

export type SettlePackErrorCode =
  /** order.status 가 paid/pending 이 아님 (failed/refunded). */
  | 'WRONG_STATUS'
  /** PortOne 응답 amount !== order.amount_krw — 위변조 의심. */
  | 'AMOUNT_MISMATCH'
  /** PortOne 응답 merchant_uid !== order.merchant_uid. */
  | 'MERCHANT_MISMATCH'
  /** PortOne 응답 status !== 'paid'. */
  | 'NOT_PAID'
  /** PortOne API 호출 실패 (네트워크 / 5xx). 재시도 가능. */
  | 'VERIFY_FAILED'
  /** order 조회 실패 (DB 오류). */
  | 'ORDER_LOOKUP_FAILED'
  /** 해당 merchant_uid order 가 존재하지 않음. */
  | 'ORDER_NOT_FOUND'
  /** Race window 가 끝났는데도 pack 을 찾지 못함 — 재시도 가치 있음. */
  | 'RACE_NO_PACK'
  /** pending → paid UPDATE 자체가 DB 오류. */
  | 'ORDER_UPDATE_FAILED'
  /** pack insert 실패 (payment 는 paid 로 마킹됨) — 운영자 개입 필요. */
  | 'PACK_INSERT_FAILED';

export type SettlePackErr = {
  ok: false;
  code: SettlePackErrorCode;
  /** HTTP status hint — 호출자가 그대로 응답해도 되도록. */
  status: number;
  error: string;
  /** order 가 발견됐다면 함께 반환 (로깅·고객지원 추적용). */
  orderId?: string;
};

export type SettlePackResult = SettlePackOk | SettlePackErr;

export type SettlePackParams = {
  merchantUid: string;
  impUid: string;
  /**
   * 로깅·진단용. 비즈니스 로직 분기에는 사용하지 않는다.
   * - 'complete' : 사용자 redirect 후 호출
   * - 'webhook'  : PortOne 서버-서버 webhook
   * - 'sweep'    : portone-pending-sweep cron 이 orphan pending 정리 시 호출
   */
  caller: 'complete' | 'webhook' | 'sweep';
};

// ─── Internal types ──────────────────────────────────────────────────────

type PackOrderRow = {
  id: string;
  user_id: string;
  organization_id: string;
  merchant_uid: string;
  amount_krw: number;
  pack_size: number;
  expires_at: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  pg_tid: string | null;
};

// Race window 재조회: 50ms × 3회 (총 ≤150ms). 첫 호출의 pack insert 가
// SQL round-trip 이 끝나는 시간을 넉넉히 커버. 그래도 못 찾으면 비정상.
const RACE_RETRY_DELAY_MS = 50;
const RACE_RETRY_MAX = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupExistingPack(orderId: string): Promise<PackResultPack | null> {
  const { data } = await supabaseAdmin
    .from('org_generation_packs')
    .select('id, remaining_count, initial_count, expires_at')
    .eq('source_ref_id', orderId)
    .eq('source', 'krw_purchase')
    .maybeSingle();
  return (data as PackResultPack | null) ?? null;
}

/**
 * Race window 대비 짧은 backoff 로 pack 재조회. PortOne API 는 재호출하지 않는다.
 * 첫 호출의 "UPDATE 직후·insert 직전" 윈도 (수 ms) 안에 두 번째 호출이
 * 도달한 경우 짧은 재조회로 자연스럽게 해결.
 */
async function lookupExistingPackWithRetry(
  orderId: string,
): Promise<PackResultPack | null> {
  for (let attempt = 0; attempt < RACE_RETRY_MAX; attempt++) {
    const pack = await lookupExistingPack(orderId);
    if (pack) return pack;
    if (attempt < RACE_RETRY_MAX - 1) {
      await sleep(RACE_RETRY_DELAY_MS);
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────

/**
 * 팩 결제 정산. 멱등성·race 안전.
 *
 * 호출자 사전 조건:
 *   - `/complete`: 인증 + `order.user_id === userId` 검증 후 호출
 *   - `/webhook`: PortOne 서버-서버 호출 (ownership 검증 없음)
 *
 * 반환값의 `status` 는 HTTP status hint — `/complete` 는 그대로 반환,
 * `/webhook` 는 PortOne 재시도 정책에 맞춰 별도 매핑.
 */
export async function settlePackOrder(
  params: SettlePackParams,
): Promise<SettlePackResult> {
  const { merchantUid, impUid, caller } = params;

  // ── 1) order 조회 ────────────────────────────────────────────────────
  const { data: orderRaw, error: orderErr } = await supabaseAdmin
    .from('krw_pack_orders')
    .select(
      'id, user_id, organization_id, merchant_uid, amount_krw, pack_size, expires_at, status, pg_tid',
    )
    .eq('merchant_uid', merchantUid)
    .maybeSingle();

  if (orderErr) {
    console.error('[packSettlement] order lookup error', {
      caller,
      merchantUid,
      impUid,
      message: orderErr.message,
    });
    return {
      ok: false,
      code: 'ORDER_LOOKUP_FAILED',
      status: 500,
      error: 'Order lookup failed',
    };
  }
  if (!orderRaw) {
    return {
      ok: false,
      code: 'ORDER_NOT_FOUND',
      status: 404,
      error: 'Order not found',
    };
  }

  const order = orderRaw as PackOrderRow;

  // ── 2) 이미 paid — idempotent 응답 ────────────────────────────────────
  if (order.status === 'paid') {
    const existingPack = await lookupExistingPackWithRetry(order.id);
    if (existingPack) {
      return {
        ok: true,
        idempotent: true,
        orderId: order.id,
        pack: existingPack,
      };
    }
    // paid 인데 pack 이 없는 정합성 깨짐 — 정상 흐름이 아래로 fall-through 한다.
    // 단, 5단계 UPDATE 는 WHERE status='pending' 이므로 0건이 되고, 0건 핸들러는
    // 다시 lookupExistingPackWithRetry 를 시도한 후 그래도 없으면 RACE_NO_PACK
    // 으로 운영 알람. 즉, 자기치유는 자동으로 일어나지 않으며, 운영자가
    // 운영 알람(captureBillingIncident → 호스팅 로그)을 받아 수동 pack grant
    // 또는 환불 처리해야 한다.
    captureBillingIncident(
      '[packSettlement] paid but pack row missing — 수동 pack grant 또는 환불 필요',
      {
        type: 'pack_missing',
        severity: 'critical',
        caller,
        order_id: order.id,
        merchant_uid: merchantUid,
        user_id: order.user_id,
        organization_id: order.organization_id,
        amount_krw: order.amount_krw,
      },
    );
  }

  // ── 3) 비정상 status ─────────────────────────────────────────────────
  if (order.status === 'failed' || order.status === 'refunded') {
    return {
      ok: false,
      code: 'WRONG_STATUS',
      status: 409,
      error: `Order is ${order.status} and cannot be completed.`,
      orderId: order.id,
    };
  }

  // ── 4) PortOne 검증 ──────────────────────────────────────────────────
  let payment;
  try {
    payment = await getPaymentInfo(impUid);
  } catch (err) {
    console.error('[packSettlement] PortOne verify failed', {
      caller,
      impUid,
      merchantUid,
      orderId: order.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      code: 'VERIFY_FAILED',
      status: 502,
      error: '결제 검증 실패',
      orderId: order.id,
    };
  }

  if (payment.status !== 'paid') {
    // 결제 실패 marking — pending row 만 실패로 전이 (이미 paid 인 경우 건드리지 않음).
    await supabaseAdmin
      .from('krw_pack_orders')
      .update({ status: 'failed' })
      .eq('id', order.id)
      .eq('status', 'pending');
    return {
      ok: false,
      code: 'NOT_PAID',
      status: 400,
      error: `결제 상태: ${payment.status}`,
      orderId: order.id,
    };
  }

  // amount 위변조 차단 — server-side 와 PortOne 응답 일치 확인.
  if (payment.amount !== order.amount_krw) {
    captureBillingIncident(
      '[packSettlement] AMOUNT MISMATCH — 결제 위변조 의심',
      {
        type: 'tamper_suspect',
        severity: 'critical',
        caller,
        order_amount_krw: order.amount_krw,
        portone_amount: payment.amount,
        merchant_uid: merchantUid,
        imp_uid: impUid,
        order_id: order.id,
        user_id: order.user_id,
        organization_id: order.organization_id,
      },
    );
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      status: 400,
      error: '결제 금액 검증 실패',
      orderId: order.id,
    };
  }

  // merchant_uid 일치 추가 방어층.
  if (payment.merchant_uid !== order.merchant_uid) {
    console.error('[packSettlement] merchant_uid mismatch', {
      caller,
      orderMerchantUid: order.merchant_uid,
      portoneMerchantUid: payment.merchant_uid,
      impUid,
      orderId: order.id,
    });
    return {
      ok: false,
      code: 'MERCHANT_MISMATCH',
      status: 400,
      error: '결제 식별자 불일치',
      orderId: order.id,
    };
  }

  // PortOne V1 paid_at — 0/null/undefined 가능 (status='paid' 인데 시간 누락).
  // NaN ISO 변환 throw 방지: 현재 시각으로 fallback.
  const paidAtMs =
    typeof payment.paid_at === 'number' && payment.paid_at > 0
      ? payment.paid_at * 1000
      : Date.now();
  const paidAtIso = new Date(paidAtMs).toISOString();

  // ── 5) pending → paid atomic 전이 ────────────────────────────────────
  const { data: updatedRows, error: updateErr } = await supabaseAdmin
    .from('krw_pack_orders')
    .update({
      status: 'paid',
      pg_tid: impUid,
      paid_at: paidAtIso,
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');

  if (updateErr) {
    console.error('[packSettlement] order update error', {
      caller,
      orderId: order.id,
      message: updateErr.message,
    });
    return {
      ok: false,
      code: 'ORDER_UPDATE_FAILED',
      status: 500,
      error: 'Order update failed',
      orderId: order.id,
    };
  }

  // 0건 갱신 = 다른 호출자가 이미 pending → paid 전이를 완료.
  // 그 호출자가 pack 도 insert 했을 가능성이 높음 → race-aware lookup.
  if (!updatedRows || updatedRows.length === 0) {
    const existingPack = await lookupExistingPackWithRetry(order.id);
    if (existingPack) {
      return {
        ok: true,
        idempotent: true,
        orderId: order.id,
        pack: existingPack,
      };
    }
    // race 가 끝났는데 pack 도 없음 — 비정상.
    // webhook 은 5xx 로 응답해 PortOne 재시도를 받으면 자연스럽게 해결될 가능성.
    console.error('[packSettlement] race detected but no pack found', {
      caller,
      orderId: order.id,
      merchantUid,
    });
    return {
      ok: false,
      code: 'RACE_NO_PACK',
      status: 409,
      error: 'Order processed concurrently. Please refresh.',
      orderId: order.id,
    };
  }

  // ── 6) org_generation_packs insert ───────────────────────────────────
  const { data: pack, error: packErr } = await supabaseAdmin
    .from('org_generation_packs')
    .insert({
      organization_id: order.organization_id,
      source: 'krw_purchase',
      source_ref_id: order.id,
      initial_count: order.pack_size,
      remaining_count: order.pack_size,
      expires_at: order.expires_at,
    })
    .select('id, remaining_count, initial_count, expires_at')
    .single();

  if (packErr || !pack) {
    // 23505 = unique_violation — partial UNIQUE 인덱스(idx_packs_source_ref_unique)가
    // 동일 source_ref_id+krw_purchase 중복을 차단. 동시 호출 중 다른 쪽이 이미 insert 완료.
    // race 가 안전하게 끝났으므로 idempotent 성공으로 처리.
    const pgCode = (packErr as { code?: string } | null)?.code;
    if (pgCode === '23505') {
      const existingPack = await lookupExistingPackWithRetry(order.id);
      if (existingPack) {
        console.log('[packSettlement] race resolved via unique violation', {
          caller,
          orderId: order.id,
        });
        return {
          ok: true,
          idempotent: true,
          orderId: order.id,
          pack: existingPack,
        };
      }
    }

    // CRITICAL: 결제는 받았는데 팩 적립 실패. 운영자 개입 필요.
    // order 는 이미 paid 로 마킹돼 있으므로 재시도 시 (2) 분기에서
    // self-heal 시도, 또는 RACE_NO_PACK 으로 운영 알람.
    captureBillingIncident(
      '[packSettlement] CRITICAL: payment succeeded but pack insert failed — 환불 또는 수동 팩 grant 필요',
      {
        type: 'refund_needed',
        severity: 'critical',
        caller,
        order_id: order.id,
        merchant_uid: merchantUid,
        imp_uid: impUid,
        user_id: order.user_id,
        organization_id: order.organization_id,
        amount_krw: order.amount_krw,
        pg_error_code: (packErr as { code?: string } | null)?.code,
        pg_error_message: packErr?.message,
      },
    );
    return {
      ok: false,
      code: 'PACK_INSERT_FAILED',
      status: 500,
      error:
        '결제는 완료됐으나 적립 중 오류가 발생했습니다. 고객지원에 주문 번호를 알려주시면 즉시 처리해드립니다.',
      orderId: order.id,
    };
  }

  const p = pack as PackResultPack;
  return {
    ok: true,
    idempotent: false,
    orderId: order.id,
    pack: {
      id: p.id,
      remaining_count: p.remaining_count,
      initial_count: p.initial_count,
      expires_at: p.expires_at,
    },
  };
}
