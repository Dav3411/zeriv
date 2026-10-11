import { NextRequest, NextResponse } from "next/server";
import { secureCompare } from "@/lib/secureCompare";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chargeWithCustomerUid,
  deleteCustomerUid,
  findPaymentByMerchantUid,
  getCustomerInfo,
  getPaymentInfo,
  PortonePGTransientError,
  PortoneV1CustomerInfo,
} from "@/lib/portone";
import {
  getPlanPrice,
  PLAN_DISPLAY_LABELS,
  toProTier,
} from "@/lib/plans-brand";
import { settlePackOrder } from "@/lib/packSettlement";
import { captureBillingIncident } from "@/lib/sentry";

/**
 * /api/cron/portone-pending-sweep
 *
 * PortOne 결제 webhook 이 미구현인 동안 발생할 수 있는 "사용자 카드는 청구됐는데
 * 구독은 활성화 안 됨" 상태를 5분 주기로 정리한다.
 *
 * 정리 대상:
 *   1) billing_key_issue_intents.status='pending' 이며 created_at < now()-10m
 *      → PG(아임포트) 에 customer_uid 가 등록됐는지 확인.
 *        - 등록됨 + portone_orders 에 동일 merchant_uid 결제 기록 존재(paid) →
 *          /api/portone/billing-key/issue 의 정상 완료 경로와 동일하게 정렬
 *        - 등록됨 + 결제 기록 없음 → 첫 결제(chargeWithCustomerUid) 후 동일 정렬
 *        - 등록 안 됨(404 등) → intent 를 failed 로 마킹
 *   2) portone_orders.status='pending' 이며 created_at < now()-10m
 *      → imp_uid 또는 merchant_uid 로 PG 조회
 *        - paid → status='paid' (race-safe: .eq('status','pending') 가드)
 *        - 그 외 → status='failed'
 *   3) krw_pack_orders.status='pending' 이며 created_at < now()-10m
 *      → merchant_uid 로 PG 조회 (checkout 시점엔 imp_uid 미존재)
 *        - paid → settlePackOrder(caller='sweep') 위임. /complete · /webhook 과
 *          정확히 동일한 검증·전이·pack insert 경로를 거친다. 멱등성은
 *          settlePackOrder 내부의 (a) .eq('status','pending') 가드 UPDATE 와
 *          (b) idx_packs_source_ref_unique partial UNIQUE 가 보장.
 *        - 그 외 → status='failed' (race-safe: .eq('status','pending'),
 *          .is('pg_tid', null) 로 paid 흐름 진입 중인 row 보호)
 *
 * 멱등성:
 *   - portone_orders.merchant_uid UNIQUE + status='pending' 가드 UPDATE
 *   - billing_key_issue_intents 도 .eq('status','pending') 로 atomic 전이
 *   - krw_pack_orders 는 settlePackOrder 에 위임 — 동일 atomic 전이 + UNIQUE 인덱스
 *   → 동일 cron 두 번 발화 또는 webhook·/complete 와 race 하더라도 단일 처리만 일어난다.
 *
 * 인증: Authorization: Bearer ${CRON_SECRET}, secureCompare 로 timing-safe 비교.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 섹션별 처리 상한. PortOne API 직렬 호출이므로 60s maxDuration 안에 수렴하도록 분리 설정.
// 각 섹션은 자기 부담(PG 호출 횟수)만큼만 가져간다 — 트래픽 증가 시 여기를 조정한다.
//
// intents: getCustomerInfo 1회 + getPaymentInfo/findPaymentByMerchantUid 1회 = PG 2~3회/건 (가장 무거움)
// orders:  getPaymentInfo 또는 findPaymentByMerchantUid 1회/건
// packs:   findPaymentByMerchantUid 1회 + settlePackOrder 내부 getPaymentInfo 1회 = PG 2회/건
//
// 합산 최대 = 30×3 + 50×1 + 50×2 = 90 + 50 + 100 = 240 PG calls
// (기존 단일 MAX_PER_RUN=50 × 3섹션 × 평균 2호출 ≒ 300 대비 약 20% 감소)
const MAX_INTENTS_PER_RUN = 30; // PG 2~3회/건 — 가장 무거움
const MAX_ORDERS_PER_RUN = 50;  // PG 1회/건
const MAX_PACKS_PER_RUN = 50;   // PG 2회/건 (sweep 조회 + settlePackOrder 내부 검증)

// "오래된 pending" 기준. 진행 중인 정상 결제와 충돌하지 않도록 충분히 길게.
const PENDING_GRACE_MS = 10 * 60 * 1000;

type IntentRow = {
  id: string;
  user_id: string;
  brand_id: string;
  organization_id: string;
  plan_key: string;
  plan_tier: number;
  customer_uid: string;
  merchant_uid: string;
  status: string;
};

type OrderRow = {
  id: string;
  merchant_uid: string;
  imp_uid: string | null;
  user_id: string | null;
  brand_id: string | null;
  organization_id: string | null;
  plan_key: string;
  amount_krw: number;
  status: string;
  order_type: string | null;
  billing_key_id: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !secureCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;
  // PG 일시 장애(PortonePGTransientError)로 다음 cron 에 재시도 위임된 건 수.
  // failed 와 별도로 집계하여 운영 알람 오탐 방지:
  //   - failed > 0 → 실제 사고 (DB 에러·비즈니스 로직 실패) → 즉시 page
  //   - retrying > 0 → PG 일시 장애 (자가치유 대기) → 알람 없음 또는 누적 임계 시 warning
  let retrying = 0;

  // ── 1) billing_key_issue_intents sweep ────────────────────────────────────
  const intentsResult = await sweepIntents(errors);
  succeeded += intentsResult.succeeded;
  failed += intentsResult.failed;
  retrying += intentsResult.retrying;

  // ── 2) portone_orders sweep ───────────────────────────────────────────────
  const ordersResult = await sweepOrders(errors);
  succeeded += ordersResult.succeeded;
  failed += ordersResult.failed;
  retrying += ordersResult.retrying;

  // ── 3) krw_pack_orders sweep ──────────────────────────────────────────────
  const packsResult = await sweepPackOrders(errors);
  succeeded += packsResult.succeeded;
  failed += packsResult.failed;
  retrying += packsResult.retrying;

  return NextResponse.json({
    swept: {
      intents: intentsResult.processed,
      orders: ordersResult.processed,
      packs: packsResult.processed,
    },
    succeeded,
    failed,
    retrying, // PG 일시 장애로 다음 cron 위임된 건 수 (failed 와 별도 집계)
    errors: errors.slice(0, 50), // 응답 폭주 방지
  });
}

// ─── intents sweep ────────────────────────────────────────────────────────────

async function sweepIntents(
  errors: string[],
): Promise<{ processed: number; succeeded: number; failed: number; retrying: number }> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS).toISOString();

  // 'pending' 과 'pg_checking' 둘 다 회수 대상.
  //   - pending      : 정상 흐름의 미완료 (10분 grace)
  //   - pg_checking  : issue 라우트가 PG 일시 장애 시 인계한 상태. 사용자는 503 안내를
  //                    받고 종료됐고, 본 cron 이 PG 회복 후 정렬한다. cutoff 는 동일하게
  //                    적용 — issue 라우트가 즉시 pg_checking 으로 전이하므로
  //                    created_at 기준 10분이 지났다면 회복 시도해도 안전.
  const { data: intentsRaw, error: queryErr } = await supabaseAdmin
    .from("billing_key_issue_intents")
    .select(
      "id, user_id, brand_id, organization_id, plan_key, plan_tier, customer_uid, merchant_uid, status",
    )
    .in("status", ["pending", "pg_checking"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_INTENTS_PER_RUN);

  if (queryErr) {
    errors.push(`intents query: ${queryErr.message}`);
    console.error("[portone-pending-sweep] intents query error:", queryErr.message);
    return { processed: 0, succeeded: 0, failed: 0, retrying: 0 };
  }

  const intents = (intentsRaw ?? []) as IntentRow[];
  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  for (const intent of intents) {
    try {
      const handled = await reconcileIntent(intent);
      if (handled === "succeeded") succeeded++;
      else if (handled === "failed") failed++;
      // 'skipped' (race 로 다른 워커가 처리) 는 카운트하지 않음
    } catch (err) {
      if (err instanceof PortonePGTransientError) {
        // PG 일시 장애 — row 상태 그대로, 다음 cron 에서 재시도
        retrying++;
        console.warn(
          "[portone-pending-sweep] PG transient — will retry next cron. intent_id=",
          intent.id,
          "merchant_uid=",
          intent.merchant_uid,
          err.message,
        );
      } else {
        // DB 에러·비즈니스 로직 실패 등 실제 장애
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`intent ${intent.id}: ${msg}`);
        console.error(
          "[portone-pending-sweep] intent reconcile hard failure. intent_id=",
          intent.id,
          "merchant_uid=",
          intent.merchant_uid,
          err,
        );
        failed++;
      }
      // 다음 intent 계속 처리 — 한 건 실패가 전체 sweep 을 막아선 안 됨
    }
  }

  // pg_checking 상태가 24h 이상 stuck 된 intent 가 있으면 운영 알람.
  // - completed_at 은 pg_checking 진입 시 issue 라우트가 갱신한 "마지막 전이 시각".
  // - 매 cron 마다 retrying 카운트로 흘러가는 동안 누군가는 페이지를 봐야 한다.
  // - 5분 주기 sweep 가 24h 동안 회복하지 못했다면 PG 측 장기 장애 또는
  //   특정 customer_uid 가 사라진(예: PortOne 콘솔에서 수동 삭제) 비정상 상황 가능성.
  try {
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // completed_at IS NULL 인 pg_checking row 도 안전망으로 검출 — 정상 코드 경로에서는
    // pg_checking 전이 시 completed_at 을 함께 세팅하지만 (issue route catch),
    // 향후 수동 DB 조작·다른 마이그레이션·미래 코드 변경으로 null 이 생길 가능성 차단.
    // null < timestamp 는 PostgreSQL 에서 false 로 평가되므로 명시적 .or 가드 필요.
    const { data: staleRows, error: staleErr } = await supabaseAdmin
      .from("billing_key_issue_intents")
      .select("id, merchant_uid")
      .eq("status", "pg_checking")
      .or(`completed_at.lt.${staleCutoff},completed_at.is.null`)
      .limit(20);

    if (staleErr) {
      console.error(
        "[portone-pending-sweep] stale pg_checking query error:",
        staleErr.message,
      );
    } else if (staleRows && staleRows.length > 0) {
      captureBillingIncident(
        "[portone-pending-sweep] intents stuck in pg_checking > 24h — PG 장기 장애 또는 좀비 intent 가능성 (운영 확인 필요)",
        {
          type: "intent_stuck_pg_checking",
          severity: "high",
          stuck_count: staleRows.length,
          sample_intent_ids: staleRows
            .slice(0, 5)
            .map((r) => r.id as string),
          sample_merchant_uids: staleRows
            .slice(0, 5)
            .map((r) => r.merchant_uid as string),
        },
      );
    }
  } catch (err) {
    // 알람 자체가 sweep 응답을 막아선 안 됨 — 로그만 남기고 계속.
    console.error("[portone-pending-sweep] stale pg_checking check failed:", err);
  }

  return { processed: intents.length, succeeded, failed, retrying };
}

/**
 * 단일 pending intent 를 PG 와 대조하여 정렬한다.
 *
 * 반환:
 *   - 'succeeded' : 결제 확정 + 구독 활성화 까지 정렬 완료
 *   - 'failed'    : intent 를 failed 로 마킹
 *   - 'skipped'   : 다른 호출이 이미 처리 (race)
 */
async function reconcileIntent(
  intent: IntentRow,
): Promise<"succeeded" | "failed" | "skipped"> {
  // 1) 빌링키가 PG 에 등록됐는지 확인.
  let customerInfo;
  try {
    customerInfo = await getCustomerInfo(intent.customer_uid);
  } catch (err) {
    // PG 일시 장애 가능성 — intent 상태를 그대로 두고 다음 cron 에 재시도 위임.
    // (getCustomerInfo 는 확실한 404/미존재 → null, 장애 가능 → PortonePGTransientError throw 로 분리됨)
    // PortonePGTransientError 를 일반 Error 로 감싸면 상위 catch 의 instanceof 분기가 무너지므로 그대로 re-throw.
    throw err;
  }

  if (!customerInfo) {
    // 확실히 미등록 (404 또는 response 없음).
    // 사용자가 결제창을 닫았거나 PG 단계에서 실패. 카드는 청구되지 않았으므로 failed 마킹 안전.
    console.warn(
      "[portone-pending-sweep] customer_uid not found on PG, marking intent failed.",
      "intent_id=",
      intent.id,
      "customer_uid=",
      intent.customer_uid,
    );
    await markIntentFailed(intent.id);
    return "failed";
  }

  // 2) 동일 merchant_uid 의 결제 기록이 portone_orders 에 이미 있는지 확인.
  //    issue route 가 결제는 성공했지만 그 후 단계에서 실패한 케이스를 우선 처리.
  const { data: existingOrder } = await supabaseAdmin
    .from("portone_orders")
    .select("id, status, imp_uid, paid_at")
    .eq("merchant_uid", intent.merchant_uid)
    .maybeSingle();

  // 3) PG 에서 실제 결제 발생 여부 조회.
  //    existingOrder.imp_uid 우선 → 없으면 merchant_uid 로 조회.
  let pgPayment;
  try {
    if (existingOrder?.imp_uid) {
      pgPayment = await getPaymentInfo(existingOrder.imp_uid as string);
    } else {
      pgPayment = await findPaymentByMerchantUid(intent.merchant_uid);
    }
  } catch (err) {
    // PG 조회 실패는 일시적일 수 있음 — intent 는 그대로 두고 다음 cron 에 재시도.
    // PortonePGTransientError 를 일반 Error 로 감싸면 상위 catch 의 instanceof 분기가 무너지므로 그대로 re-throw.
    throw err;
  }

  // 4-A) 이미 PG 에 paid 결제가 있는 경우 → 정렬만 수행 (chargeWithCustomerUid 호출 X)
  if (pgPayment && pgPayment.status === "paid") {
    // paid_at 누락 케이스 (status='paid' 이나 시간 미기록) 는 현재 epoch 로 fallback.
    const paidAtEpoch =
      typeof pgPayment.paid_at === "number" && pgPayment.paid_at > 0
        ? pgPayment.paid_at
        : Math.floor(Date.now() / 1000);
    return await finalizeIntentAsPaid({
      intent,
      customerInfo,
      paidImpUid: pgPayment.imp_uid,
      paidAtEpoch,
      paidAmountKrw: pgPayment.amount,
      existingOrderId: existingOrder?.id as string | undefined,
    });
  }

  // 4-B) PG 에 결제 기록은 있으나 paid 가 아니면 (failed/cancelled/ready) → intent failed
  if (pgPayment && pgPayment.status !== "paid") {
    console.warn(
      "[portone-pending-sweep] PG payment exists but not paid. intent_id=",
      intent.id,
      "merchant_uid=",
      intent.merchant_uid,
      "pg_status=",
      pgPayment.status,
    );
    await markIntentFailed(intent.id);
    return "failed";
  }

  // 4-C) PG 에 결제 자체가 없음 + 빌링키는 등록됨 → 이중 청구 위험 없으므로 첫 결제 진행.
  //      issue route 의 정상 경로를 그대로 수행한다.
  return await chargeAndFinalizeIntent({ intent, customerInfo });
}

async function chargeAndFinalizeIntent({
  intent,
  customerInfo,
}: {
  intent: IntentRow;
  // null 은 reconcileIntent 단계에서 이미 걸러진 후 호출됨 — 여기서는 항상 존재.
  customerInfo: PortoneV1CustomerInfo;
}): Promise<"succeeded" | "failed" | "skipped"> {
  const planTier =
    intent.plan_key === "pro" ? toProTier(intent.plan_tier) : 1;
  const amountKrw = getPlanPrice(intent.plan_key, planTier);
  if (amountKrw <= 0) {
    console.warn(
      "[portone-pending-sweep] non-billable plan, marking intent failed. intent_id=",
      intent.id,
      "plan_key=",
      intent.plan_key,
    );
    await markIntentFailed(intent.id);
    return "failed";
  }

  // ── M-1 fix: pending-first insert (billing-renewal 패턴) ─────────────────
  // sweep+sweep 또는 sweep+사용자 race 시 chargeWithCustomerUid 이중 호출을 차단.
  // portone_orders.merchant_uid UNIQUE 가 두 번째 진입자의 charge 호출 자체를 막는다.
  // select("id")로 row id 를 받아 finalizeIntentAsPaid 의 UPDATE 경로로 전달함으로써
  // 결제 완료 후 pending row 가 즉시 paid 로 정렬되도록 한다.
  const { data: pendingRow, error: pendingErr } = await supabaseAdmin
    .from("portone_orders")
    .insert({
      user_id: intent.user_id,
      brand_id: intent.brand_id,
      organization_id: intent.organization_id,
      merchant_uid: intent.merchant_uid,
      plan_key: intent.plan_key,
      amount_krw: amountKrw,
      status: "pending",
      order_type: "billing_first",
    })
    .select("id")
    .single();

  if (pendingErr) {
    const code = (pendingErr as { code?: string }).code;
    if (code === "23505") {
      // 다른 호출자(sweep 또는 issue 재시도)가 이미 pending/paid row 생성.
      // charge 를 호출하지 않는다 — 다음 cron 의 reconcileOrder 또는
      // issue route 가 최종 정렬을 담당한다.
      console.info(
        "[portone-pending-sweep] intent already has portone_orders row — skipping charge.",
        "intent_id=",
        intent.id,
        "merchant_uid=",
        intent.merchant_uid,
      );
      return "skipped";
    }
    // 그 외 DB 에러 — throw 로 다음 cron 에 위임
    throw new Error(
      `[portone-pending-sweep] pending insert failed: ${pendingErr.message}`,
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  let chargeResult;
  try {
    chargeResult = await chargeWithCustomerUid({
      customerUid: intent.customer_uid,
      merchantUid: intent.merchant_uid,
      amountKrw,
      orderName: `Zeriv ${PLAN_DISPLAY_LABELS[intent.plan_key] ?? intent.plan_key} 정기결제`,
    });
  } catch (err) {
    console.error(
      "[portone-pending-sweep] chargeWithCustomerUid failed. intent_id=",
      intent.id,
      "merchant_uid=",
      intent.merchant_uid,
      err,
    );
    await markIntentFailed(intent.id);
    return "failed";
  }

  if (chargeResult.status !== "paid") {
    await markIntentFailed(intent.id);
    return "failed";
  }

  return await finalizeIntentAsPaid({
    intent,
    customerInfo,
    paidImpUid: chargeResult.imp_uid,
    paidAtEpoch: chargeResult.paid_at,
    paidAmountKrw: chargeResult.amount,
    existingOrderId: pendingRow.id as string,
  });
}

/**
 * issue route 의 L259~L453 에 해당하는 후처리:
 *   - 이전 active 빌링키 정리
 *   - portone_billing_keys upsert
 *   - portone_orders insert (없을 때만)
 *   - subscriptions upsert
 *   - intent 를 completed (또는 completed_with_warning) 로 마킹
 */
async function finalizeIntentAsPaid({
  intent,
  customerInfo,
  paidImpUid,
  paidAtEpoch,
  paidAmountKrw,
  existingOrderId,
}: {
  intent: IntentRow;
  // null 은 reconcileIntent 단계에서 이미 걸러진 후 호출됨 — 여기서는 항상 존재.
  customerInfo: PortoneV1CustomerInfo;
  paidImpUid: string;
  paidAtEpoch: number;
  paidAmountKrw: number;
  existingOrderId?: string;
}): Promise<"succeeded" | "failed"> {
  const planTier =
    intent.plan_key === "pro" ? toProTier(intent.plan_tier) : 1;
  const planPriceKrw = getPlanPrice(intent.plan_key, planTier);
  // 결제는 이미 발생했으므로 plan_price 가 0 이어도 정렬은 진행해야 한다.
  // (수동 환불은 운영자가 별도로 처리. 여기선 데이터 정합성만 회복.)
  // amount_krw 컬럼은 가능하면 plan price 를 우선 기록하되, 없으면 PG 청구 금액으로 fallback.
  const recordedAmountKrw = planPriceKrw > 0 ? planPriceKrw : paidAmountKrw;

  const paidAt = new Date(paidAtEpoch * 1000).toISOString();
  const periodEnd = new Date(
    paidAtEpoch * 1000 + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // (a) 이전 active 빌링키 정리 — issue route 와 동일한 방어 로직.
  const { data: prevActiveKeys } = await supabaseAdmin
    .from("portone_billing_keys")
    .select("id, billing_key")
    .eq("user_id", intent.user_id)
    .eq("status", "active")
    .neq("billing_key", intent.customer_uid);

  if (prevActiveKeys && prevActiveKeys.length > 0) {
    for (const prev of prevActiveKeys) {
      let pgDeleteFailed = false;
      try {
        await deleteCustomerUid(prev.billing_key as string);
      } catch (err) {
        pgDeleteFailed = true;
        console.error(
          "[portone-pending-sweep] deleteCustomerUid failed (queued for retry). billing_key=",
          prev.billing_key,
          err,
        );
      }
      await supabaseAdmin
        .from("portone_billing_keys")
        .update({
          status: "expired",
          pg_delete_pending: pgDeleteFailed,
        })
        .eq("id", prev.id as string);
    }
  }

  // (b) portone_billing_keys upsert
  const { data: bkRow, error: bkErr } = await supabaseAdmin
    .from("portone_billing_keys")
    .upsert(
      {
        brand_id: intent.brand_id,
        user_id: intent.user_id,
        plan_key: intent.plan_key,
        billing_key: intent.customer_uid,
        pg_provider: customerInfo.pg_provider ?? null,
        card_last4: customerInfo.card_number?.slice(-4) ?? null,
        card_brand: customerInfo.card_name ?? null,
        status: "active",
        first_paid_at: paidAt,
        next_billing_at: periodEnd,
        pg_delete_pending: false,
      },
      { onConflict: "billing_key" },
    )
    .select("id")
    .single();

  if (bkErr || !bkRow) {
    console.error(
      "[portone-pending-sweep] billing_keys upsert failed. intent_id=",
      intent.id,
      bkErr?.message,
    );
    // 결제는 이미 됐으므로 intent 를 failed 로 마킹하면 더 큰 정합성 문제 발생.
    // 다음 cron 에서 재시도하도록 그대로 둔다 (intent.status='pending' 유지).
    return "failed";
  }

  // (c) portone_orders insert (없을 때만). 동시 race 시 23505 → 무시하고 계속.
  if (!existingOrderId) {
    const { error: orderErr } = await supabaseAdmin
      .from("portone_orders")
      .insert({
        user_id: intent.user_id,
        brand_id: intent.brand_id,
        organization_id: intent.organization_id,
        merchant_uid: intent.merchant_uid,
        imp_uid: paidImpUid,
        plan_key: intent.plan_key,
        amount_krw: recordedAmountKrw,
        status: "paid",
        paid_at: paidAt,
        order_type: "billing_first",
        billing_key_id: bkRow.id,
      });

    if (orderErr) {
      const code = (orderErr as { code?: string }).code;
      if (code !== "23505") {
        console.error(
          "[portone-pending-sweep] portone_orders insert failed (charge succeeded). intent_id=",
          intent.id,
          "merchant_uid=",
          intent.merchant_uid,
          orderErr.message,
        );
        // 결제는 됐으므로 sub 활성화는 계속 진행 — orders 누락은 warning 으로만 표시.
      }
    }
  } else {
    // 기존 row 가 있으면 imp_uid/paid_at/status 만 정렬.
    await supabaseAdmin
      .from("portone_orders")
      .update({
        imp_uid: paidImpUid,
        status: "paid",
        paid_at: paidAt,
        billing_key_id: bkRow.id,
      })
      .eq("id", existingOrderId)
      .neq("status", "paid"); // 이미 paid 면 덮어쓰지 않음
  }

  // (d) subscriptions upsert
  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", intent.organization_id)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  if (existingSub?.id) {
    const { error: subUpdateErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: intent.plan_key,
        plan_tier: planTier,
        status: "active",
        current_period_end: periodEnd,
        billing_key_id: bkRow.id,
        auto_renew: true,
        last_renewed_at: paidAt,
      })
      .eq("id", existingSub.id)
      .eq("organization_id", intent.organization_id);

    if (subUpdateErr) {
      console.error(
        "[portone-pending-sweep] subscriptions update failed. intent_id=",
        intent.id,
        subUpdateErr.message,
      );
      return "failed";
    }
  } else {
    const { error: subInsertErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        organization_id: intent.organization_id,
        brand_id: intent.brand_id,
        plan: intent.plan_key,
        plan_tier: planTier,
        status: "active",
        current_period_end: periodEnd,
        billing_key_id: bkRow.id,
        auto_renew: true,
        last_renewed_at: paidAt,
      });

    if (subInsertErr) {
      console.error(
        "[portone-pending-sweep] subscriptions insert failed. intent_id=",
        intent.id,
        subInsertErr.message,
      );
      return "failed";
    }
  }

  // (e) intent 마킹 — pending 또는 pg_checking 일 때만 (atomic 전이로 race 차단).
  // 'pg_checking' 은 issue 라우트가 PG 일시 장애 시 인계한 상태이며, 본 sweep 가
  // 정상 정렬 경로(succeeded)에 도달했다면 completed 로 전이시켜야 한다.
  // completed/failed/completed_with_warning 으로 이미 정렬된 row 는 가드에 의해 보호된다.
  const { data: intentUpdated, error: intentUpdateErr } = await supabaseAdmin
    .from("billing_key_issue_intents")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .in("status", ["pending", "pg_checking"])
    .select("id");

  if (intentUpdateErr) {
    console.error(
      "[portone-pending-sweep] intent finalize update error. intent_id=",
      intent.id,
      intentUpdateErr.message,
    );
    // 위 update 가 실패하더라도 결제/구독은 정렬된 상태이므로 다음 cron 이 동일 결과로 수렴한다.
    return "failed";
  }

  if (!intentUpdated || intentUpdated.length === 0) {
    // 다른 워커가 이미 transition 시킴
    return "succeeded";
  }

  console.info(
    "[portone-pending-sweep] intent reconciled. intent_id=",
    intent.id,
    "merchant_uid=",
    intent.merchant_uid,
    "imp_uid=",
    paidImpUid,
  );
  return "succeeded";
}

async function markIntentFailed(intentId: string): Promise<void> {
  // pending 또는 pg_checking 일 때만 failed 로 전이 (race-safe).
  // pg_checking 은 issue 라우트가 PG 일시 장애 시 인계한 상태이며, sweep 가
  // PG 회복 후 customer_uid 미등록 또는 결제 실패를 확인했다면 failed 로 확정한다.
  await supabaseAdmin
    .from("billing_key_issue_intents")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", intentId)
    .in("status", ["pending", "pg_checking"]);
}

// ─── orders sweep ─────────────────────────────────────────────────────────────

async function sweepOrders(
  errors: string[],
): Promise<{ processed: number; succeeded: number; failed: number; retrying: number }> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS).toISOString();

  const { data: ordersRaw, error: queryErr } = await supabaseAdmin
    .from("portone_orders")
    .select(
      "id, merchant_uid, imp_uid, user_id, brand_id, organization_id, plan_key, amount_krw, status, order_type, billing_key_id",
    )
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_ORDERS_PER_RUN);

  if (queryErr) {
    errors.push(`orders query: ${queryErr.message}`);
    console.error("[portone-pending-sweep] orders query error:", queryErr.message);
    return { processed: 0, succeeded: 0, failed: 0, retrying: 0 };
  }

  const orders = (ordersRaw ?? []) as OrderRow[];
  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  for (const order of orders) {
    try {
      const handled = await reconcileOrder(order);
      if (handled === "succeeded") succeeded++;
      else if (handled === "failed") failed++;
    } catch (err) {
      if (err instanceof PortonePGTransientError) {
        // PG 일시 장애 — row 상태 그대로, 다음 cron 에서 재시도
        retrying++;
        console.warn(
          "[portone-pending-sweep] PG transient — will retry next cron. order_id=",
          order.id,
          "merchant_uid=",
          order.merchant_uid,
          err.message,
        );
      } else {
        // DB 에러·비즈니스 로직 실패 등 실제 장애
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`order ${order.id}: ${msg}`);
        console.error(
          "[portone-pending-sweep] order reconcile hard failure. order_id=",
          order.id,
          "merchant_uid=",
          order.merchant_uid,
          err,
        );
        failed++;
      }
    }
  }

  return { processed: orders.length, succeeded, failed, retrying };
}

async function reconcileOrder(
  order: OrderRow,
): Promise<"succeeded" | "failed" | "skipped"> {
  // PG 결제 조회
  let pgPayment;
  try {
    if (order.imp_uid) {
      pgPayment = await getPaymentInfo(order.imp_uid);
    } else {
      pgPayment = await findPaymentByMerchantUid(order.merchant_uid);
    }
  } catch (err) {
    // 일시적 PG 에러는 다음 cron 으로 위임.
    // PortonePGTransientError 를 일반 Error 로 감싸면 상위 catch 의 instanceof 분기가 무너지므로 그대로 re-throw.
    throw err;
  }

  // 결제 성공 → status='paid' (race-safe)
  if (pgPayment && pgPayment.status === "paid") {
    // paid_at 0/null/undefined 케이스 — NaN ISO 변환 방지, 현재 시각 fallback.
    const paidAtMs =
      typeof pgPayment.paid_at === "number" && pgPayment.paid_at > 0
        ? pgPayment.paid_at * 1000
        : Date.now();
    const paidAt = new Date(paidAtMs).toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("portone_orders")
      .update({
        imp_uid: pgPayment.imp_uid,
        status: "paid",
        paid_at: paidAt,
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id");

    if (updateErr) {
      console.error(
        "[portone-pending-sweep] order paid update error. order_id=",
        order.id,
        updateErr.message,
      );
      return "failed";
    }
    if (!updated || updated.length === 0) {
      // 다른 워커가 먼저 정렬
      return "skipped";
    }

    // billing_renewal 의 경우 subscription period_end / billing_keys.next_billing_at
    // 을 함께 정렬해야 cron 이 같은 sub 를 다시 잡지 않는다.
    if (order.order_type === "billing_renewal" && order.billing_key_id) {
      await reconcileSubscriptionForRenewal(order, paidAt);
    }

    console.info(
      "[portone-pending-sweep] order paid. order_id=",
      order.id,
      "merchant_uid=",
      order.merchant_uid,
    );
    return "succeeded";
  }

  // 결제 실패/미존재 → status='failed' (race-safe)
  const { data: failedRows, error: failErr } = await supabaseAdmin
    .from("portone_orders")
    .update({ status: "failed" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");

  if (failErr) {
    console.error(
      "[portone-pending-sweep] order failed update error. order_id=",
      order.id,
      failErr.message,
    );
    return "failed";
  }
  if (!failedRows || failedRows.length === 0) {
    return "skipped";
  }

  console.info(
    "[portone-pending-sweep] order marked failed. order_id=",
    order.id,
    "merchant_uid=",
    order.merchant_uid,
    "pg_status=",
    pgPayment?.status ?? "not_found",
  );
  return "succeeded";
}

/**
 * billing_renewal 결제가 sweep 으로 paid 정렬된 경우의 후처리:
 *   - subscriptions.current_period_end / last_renewed_at
 *   - portone_billing_keys.fail_count=0, next_billing_at
 *
 * billing-renewal cron 의 newPeriodEnd 계산식과 동일한 규칙(기존 period_end + 30d) 을
 * 따라 권한 일수가 어긋나지 않도록 한다.
 */
async function reconcileSubscriptionForRenewal(
  order: OrderRow,
  paidAt: string,
): Promise<void> {
  if (!order.billing_key_id) return;

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, current_period_end, last_renewed_at")
    .eq("billing_key_id", order.billing_key_id)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  if (!sub) {
    console.warn(
      "[portone-pending-sweep] no active subscription for billing_renewal. order_id=",
      order.id,
      "billing_key_id=",
      order.billing_key_id,
    );
    return;
  }

  // 멱등 가드: 이미 같은 paid_at 으로 정렬됐다면 skip.
  if (sub.last_renewed_at === paidAt) return;

  const newPeriodEnd = new Date(
    new Date(sub.current_period_end as string).getTime() +
      30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .update({
        current_period_end: newPeriodEnd,
        last_renewed_at: paidAt,
      })
      .eq("id", sub.id as string)
      // current_period_end 가 그대로일 때만 — 다른 경로(예: change-plan)와 race 방지
      .eq("current_period_end", sub.current_period_end as string),
    supabaseAdmin
      .from("portone_billing_keys")
      .update({ fail_count: 0, next_billing_at: newPeriodEnd })
      .eq("id", order.billing_key_id),
  ]);
}

// ─── krw_pack_orders sweep ────────────────────────────────────────────────────
//
// 사용자가 PortOne 결제창을 닫거나(취소 X 버튼) 모바일에서 redirect 가 끊긴 경우
// /api/packs/krw/complete 가 호출되지 않아 status='pending' 으로 영구히 남는 문제 해결.
// 정상 결제는 /complete 가, redirect 실패 결제는 /webhook 이 처리하지만, 둘 다 실패한
// orphan pending 은 본 cron 만이 회수할 수 있다.
//
// 처리 방식:
//   - PG 가 paid → settlePackOrder({caller:'sweep'}) 위임. /complete · /webhook 과
//     동일한 단일 SoT 경로를 거치므로 검증·전이·pack insert·멱등성이 정확히 동일.
//   - PG 가 paid 아님 (또는 결제 자체 없음) → status='failed' 로 race-safe UPDATE.

type PackOrderRow = {
  id: string;
  merchant_uid: string;
  status: string;
};

async function sweepPackOrders(
  errors: string[],
): Promise<{ processed: number; succeeded: number; failed: number; retrying: number }> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS).toISOString();

  const { data: pendingRaw, error: queryErr } = await supabaseAdmin
    .from("krw_pack_orders")
    .select("id, merchant_uid, status")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_PACKS_PER_RUN);

  if (queryErr) {
    errors.push(`pack orders query: ${queryErr.message}`);
    console.error(
      "[portone-pending-sweep] pack orders query error:",
      queryErr.message,
    );
    return { processed: 0, succeeded: 0, failed: 0, retrying: 0 };
  }

  const pending = (pendingRaw ?? []) as PackOrderRow[];
  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  for (const order of pending) {
    try {
      const handled = await reconcilePackOrder(order);
      if (handled === "succeeded") succeeded++;
      else if (handled === "failed") failed++;
      // 'skipped' (race 로 다른 호출자가 먼저 정렬) 는 카운트하지 않음
    } catch (err) {
      if (err instanceof PortonePGTransientError) {
        // PG 일시 장애 — row 상태 그대로, 다음 cron 에서 재시도
        retrying++;
        console.warn(
          "[portone-pending-sweep] PG transient — will retry next cron. pack_order_id=",
          order.id,
          "merchant_uid=",
          order.merchant_uid,
          err.message,
        );
      } else {
        // DB 에러·비즈니스 로직 실패 등 실제 장애
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`pack order ${order.id}: ${msg}`);
        console.error(
          "[portone-pending-sweep] pack order reconcile hard failure. order_id=",
          order.id,
          "merchant_uid=",
          order.merchant_uid,
          err,
        );
        failed++;
      }
      // 다음 order 계속 처리 — 한 건 실패가 전체 sweep 을 막아선 안 됨
    }
  }

  return { processed: pending.length, succeeded, failed, retrying };
}

/**
 * 단일 pending krw_pack_orders 를 PG 와 대조하여 정렬한다.
 *
 * settlePackOrder 는 impUid 를 받아 getPaymentInfo(impUid) 로 검증하지만,
 * pending 시점에는 imp_uid 가 DB 에 저장돼 있지 않다 (checkout 단계 insert 라).
 * 따라서 sweep 은 먼저 findPaymentByMerchantUid 로 PG 에 imp_uid 가 있는지 묻고,
 * paid 응답이 오면 settlePackOrder 로 정상 경로를 그대로 실행한다.
 *
 * PortOne API 호출이 2회(merchant_uid 조회 + settlePackOrder 내부의 imp_uid 검증)
 * 가 되지만, /complete · /webhook 과 같은 단일 정산 경로를 공유하는 가치가 압도적이라
 * 의도된 트레이드오프. MAX_PER_RUN=50, 5분 주기에서 충분히 감당 가능.
 *
 * 반환:
 *   - 'succeeded' : paid 정렬 완료 또는 failed 마킹 완료
 *   - 'failed'    : settlePackOrder 가 retry 가치 있는 코드로 실패 (다음 cron 재시도)
 *   - 'skipped'   : 다른 호출자가 이미 처리 (race)
 */
async function reconcilePackOrder(
  order: PackOrderRow,
): Promise<"succeeded" | "failed" | "skipped"> {
  // 1) PG 에 결제가 실제로 일어났는지 조회. 일시 장애는 throw → 상위 catch.
  let pgPayment;
  try {
    pgPayment = await findPaymentByMerchantUid(order.merchant_uid);
  } catch (err) {
    // PortonePGTransientError 를 일반 Error 로 감싸면 상위 catch 의 instanceof 분기가 무너지므로 그대로 re-throw.
    throw err;
  }

  // 2-A) PG paid → settlePackOrder 위임. 내부에서 getPaymentInfo 로 amount 재검증.
  if (pgPayment && pgPayment.status === "paid") {
    const result = await settlePackOrder({
      merchantUid: order.merchant_uid,
      impUid: pgPayment.imp_uid,
      caller: "sweep",
    });

    if (result.ok) {
      console.info(
        "[portone-pending-sweep] pack order settled. order_id=",
        order.id,
        "merchant_uid=",
        order.merchant_uid,
        "idempotent=",
        result.idempotent,
      );
      return "succeeded";
    }

    // settlePackOrder 실패 분기 — webhook route 의 retry/ack 매핑과 동일 원칙:
    //   - 일시 장애성 (VERIFY_FAILED / ORDER_UPDATE_FAILED / RACE_NO_PACK /
    //     PACK_INSERT_FAILED) → 다음 cron 재시도 가능. 'failed' 로 카운트.
    //   - 비즈니스 실패 (AMOUNT_MISMATCH / MERCHANT_MISMATCH / WRONG_STATUS /
    //     NOT_PAID / ORDER_NOT_FOUND / ORDER_LOOKUP_FAILED) → 재시도해도 결과 동일.
    //     status='pending' 으로 두면 매 cron 마다 같은 PG 콜만 반복되므로
    //     AMOUNT/MERCHANT MISMATCH 는 별도 위변조 알람 (settlePackOrder 내부에서
    //     captureBillingIncident 호출) 후 failed 마킹해 cron 큐에서 제거. NOT_PAID 의 경우
    //     settlePackOrder 내부에서 이미 failed 로 마킹 시도하므로 추가 작업 불필요.
    console.warn(
      "[portone-pending-sweep] pack order settlement failed. order_id=",
      order.id,
      "merchant_uid=",
      order.merchant_uid,
      "code=",
      result.code,
    );

    // AMOUNT_MISMATCH / MERCHANT_MISMATCH 만 명시적으로 failed 로 격리.
    // 다른 NOT_PAID 등은 settlePackOrder 가 이미 failed 마킹했거나 다음 cron 재시도가 안전.
    if (
      result.code === "AMOUNT_MISMATCH" ||
      result.code === "MERCHANT_MISMATCH"
    ) {
      await supabaseAdmin
        .from("krw_pack_orders")
        .update({
          status: "failed",
          refund_reason: `자동 sweep: ${result.code} (위변조 의심 — 운영 확인 필요)`,
        })
        .eq("id", order.id)
        .eq("status", "pending");
      // 위변조 의심 건은 정산 성공이 아니라 차단 처리이므로 'failed' 로 카운팅.
      // 응답 JSON 의 succeeded 카운터가 위변조 건을 정산 성공으로 오해하지 않도록 한다.
      return "failed";
    }

    return "failed";
  }

  // 2-B) PG 가 결제 없음 또는 paid 가 아님 → failed 로 race-safe UPDATE.
  //   .eq('status','pending') : /complete 나 /webhook 이 동시에 진행 중이면 0건이 되어
  //                              해당 호출이 paid 로 전이하도록 양보.
  //   .is('pg_tid', null)     : settlePackOrder 의 paid 전이는 pg_tid 를 채우므로
  //                              방어층 한 겹 추가 (webhook 의 failed 마킹 패턴과 일치).
  const pgStatusLabel = pgPayment?.status ?? "not_found";
  const { data: failedRows, error: failErr } = await supabaseAdmin
    .from("krw_pack_orders")
    .update({
      status: "failed",
      refund_reason: `자동 sweep: PG 상태 ${pgStatusLabel}`,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("pg_tid", null)
    .select("id");

  if (failErr) {
    console.error(
      "[portone-pending-sweep] pack order failed update error. order_id=",
      order.id,
      failErr.message,
    );
    return "failed";
  }
  if (!failedRows || failedRows.length === 0) {
    // 다른 호출자가 (a) paid 로 전이했거나 (b) 이미 failed 로 마킹.
    return "skipped";
  }

  console.info(
    "[portone-pending-sweep] pack order marked failed. order_id=",
    order.id,
    "merchant_uid=",
    order.merchant_uid,
    "pg_status=",
    pgStatusLabel,
  );
  return "succeeded";
}
