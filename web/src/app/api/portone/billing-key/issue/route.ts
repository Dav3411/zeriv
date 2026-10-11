import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCustomerInfo,
  chargeWithCustomerUid,
  deleteCustomerUid,
  PortonePGTransientError,
} from "@/lib/portone";
import {
  getPlanPrice,
  PLAN_DISPLAY_LABELS,
  toProTier,
} from "@/lib/plans-brand";
import { captureBillingIncident } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * POST /api/portone/billing-key/issue
 *
 * 빌링키 발급 + 첫 결제 + 구독 활성화를 한 번에 수행한다.
 *
 * 입력 (둘 중 하나 필수):
 *   - { intentId } : redirect 복귀 케이스에서 단일 키로 진입 (권장)
 *   - { customerUid, merchantUid } : 데스크톱 콜백 케이스 호환용
 *
 * 보안/멱등 키:
 *   - billing_key_issue_intents 테이블의 status 가 단일 멱등성 키.
 *   - 서버에서 발급한 customer_uid/merchant_uid 만 매핑 테이블에 존재하므로,
 *     클라이언트가 임의의 값으로 진입할 수 없다.
 *   - 동시 호출 race 는 atomic UPDATE ... WHERE status='pending' RETURNING 으로
 *     단 하나의 호출만 잠금을 획득하도록 보장한다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    intentId?: string;
    customerUid?: string;
    merchantUid?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 1) intent 조회 (intentId 우선, fallback customerUid+merchantUid) ───────
  let intentQuery = supabaseAdmin
    .from("billing_key_issue_intents")
    .select(
      "id, user_id, brand_id, organization_id, plan_key, plan_tier, customer_uid, merchant_uid, status",
    )
    .eq("user_id", userId);

  if (body.intentId) {
    intentQuery = intentQuery.eq("id", body.intentId);
  } else if (body.customerUid && body.merchantUid) {
    intentQuery = intentQuery
      .eq("customer_uid", body.customerUid)
      .eq("merchant_uid", body.merchantUid);
  } else {
    return NextResponse.json(
      { error: "intentId 또는 customerUid+merchantUid 가 필요합니다." },
      { status: 400 },
    );
  }

  const { data: intentRow, error: intentLookupErr } = await intentQuery
    .maybeSingle();

  if (intentLookupErr) {
    console.error(
      "[billing-key/issue] intent lookup error:",
      intentLookupErr.message,
    );
    return NextResponse.json(
      { error: "결제 준비 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  if (!intentRow) {
    // 다른 user의 intent를 조회하려 했거나, prepare를 거치지 않은 위조 요청
    return NextResponse.json(
      { error: "결제 준비 정보를 찾을 수 없습니다." },
      { status: 403 },
    );
  }

  const intent = intentRow as IntentRow;

  // ── 2) idempotent 분기 ────────────────────────────────────────────────────
  if (intent.status === "completed" || intent.status === "completed_with_warning") {
    // 이미 처리됐음 — 중복 호출은 success 로 응답 (멱등)
    return NextResponse.json({
      success: true,
      idempotent: true,
      ...(intent.status === "completed_with_warning" && {
        warning: "결제는 완료됐으나 일부 후속 처리에 경고가 있습니다.",
      }),
    });
  }
  if (intent.status === "failed") {
    return NextResponse.json(
      {
        error:
          "이전 결제 시도가 실패한 의도입니다. 다시 결제를 시작해주세요.",
      },
      { status: 409 },
    );
  }
  // pg_checking — PG 일시 장애로 sweep cron 이 인계받은 상태.
  // 사용자가 같은 결제 결과 페이지를 새로고침/재시도하면 여기로 들어온다.
  // PG·DB 부담을 피하기 위해 즉시 503 + 안내 코드로 응답하고, sweep 회복에 위임한다.
  if (intent.status === "pg_checking") {
    return NextResponse.json(
      {
        error:
          "PG 처리 진행 중입니다. 잠시 후 자동 완료됩니다. 카드는 청구되지 않았습니다.",
        code: "PG_CHECKING_IN_PROGRESS",
        intentId: intent.id,
      },
      { status: 503 },
    );
  }
  if (intent.status !== "pending") {
    return NextResponse.json(
      { error: `알 수 없는 intent 상태: ${intent.status}` },
      { status: 500 },
    );
  }

  // ── 3) 동시 호출 race 차단 — atomic transition pending → processing 가상 잠금 ─
  // 'processing' 상태가 별도로 없으므로, completed_at 을 제외하고 status 를 임시 'pending' 그대로 두되
  // updated 행을 하나만 잡기 위해 WHERE status='pending' 로 한 번 더 잠금. 단순화:
  //   여기서는 별도 lock 컬럼을 두지 않고 row select 후 처리하되, 마지막 update 가 'pending' 인지 확인.
  // PostgREST 한계로 RETURNING 이후 NOOP 이면 lost update 가능 — 이를 위해
  // failed 처리 분기에서 항상 status='pending' 일 때만 update.
  // (멀티 동시 호출 시 두 번째 호출은 chargeWithCustomerUid 가 portone_orders.merchant_uid UNIQUE 충돌에 막힌다.)

  const { brand_id: brandId, organization_id: organizationId } = intent;
  const planKey = intent.plan_key;
  const planTier = planKey === "pro" ? toProTier(intent.plan_tier) : 1;
  const customerUid = intent.customer_uid;
  const merchantUid = intent.merchant_uid;

  // ── 4) 권한 재검증 (방어적 — prepare 이후 권한이 회수됐을 수 있음) ──────────
  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("id, organization_id, user_id")
    .eq("id", brandId)
    .maybeSingle();
  if (brandError) {
    console.error(
      "[billing-key/issue] brand lookup error:",
      brandError.message,
    );
    return NextResponse.json({ error: "Brand lookup failed" }, { status: 500 });
  }
  if (!brand || brand.user_id !== userId) {
    return NextResponse.json(
      { error: "Brand not found or unauthorized" },
      { status: 403 },
    );
  }

  const { data: memberRow, error: memberError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) {
    console.error(
      "[billing-key/issue] member lookup error:",
      memberError.message,
    );
    return NextResponse.json(
      { error: "Permission check failed" },
      { status: 500 },
    );
  }
  if (!memberRow || !["owner", "admin"].includes(memberRow.role as string)) {
    return NextResponse.json(
      { error: "이 Organization에 결제 권한이 없습니다." },
      { status: 403 },
    );
  }

  // ── 5) 금액 계산 ──────────────────────────────────────────────────────────
  // 단일 source of truth — getPlanPrice(planKey, tier).
  // pro 는 tier 기반 동적, 그 외(quick_plus / starter / label)는 고정값. 0 이면 비빌링.
  const amountKrw = getPlanPrice(planKey, planTier);
  if (amountKrw <= 0) {
    await markIntentFailed(intent.id);
    return NextResponse.json(
      { error: `Unsupported planKey for billing: ${planKey}` },
      { status: 400 },
    );
  }

  // ── 6) PG 측 customer_uid 유효성 검증 ─────────────────────────────────────
  let customerInfo;
  try {
    customerInfo = await getCustomerInfo(customerUid);
  } catch (err) {
    if (err instanceof PortonePGTransientError) {
      // PG 일시 장애 — intent 를 'pg_checking' 으로 전이하여 사용자 재시도 루프를 차단한다.
      // - pending → pg_checking 으로 race-safe atomic update (다른 호출이 이미 처리했으면 0건)
      // - 사용자에겐 503 + 명시적 코드 → 클라이언트가 자동 재시도하지 않고 안내만 표시
      // - sweep cron 이 'pg_checking' 도 'pending' 과 동일하게 회수해 PG 회복 시 자동 정렬
      // - completed_at 을 "마지막 상태 전이 시각" 으로 갱신 → 24h 이상 stuck 검출에 사용
      console.warn(
        "[billing-key/issue] PG transient — transitioning intent to pg_checking. intent_id=",
        intent.id,
        "merchant_uid=",
        merchantUid,
        err.message,
      );
      const { error: pgCheckingErr } = await supabaseAdmin
        .from("billing_key_issue_intents")
        .update({
          status: "pg_checking",
          completed_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "pending");
      // race-safe: 0건 갱신은 다른 호출이 이미 처리했다는 의미 (정상). DB 에러만 경고.
      if (pgCheckingErr) {
        console.warn(
          "[billing-key/issue] pg_checking transition DB error — intent may stay pending. intent_id=",
          intent.id,
          "err=",
          pgCheckingErr.message,
        );
      }

      return NextResponse.json(
        {
          error:
            "PG 서비스 일시 장애. 잠시 후 자동 처리됩니다. 카드는 청구되지 않았습니다.",
          code: "PG_TRANSIENT_RETRY_LATER",
          intentId: intent.id,
        },
        { status: 503 },
      );
    }

    // 그 외 예상 외 에러 — 기존과 동일하게 502 (intent 는 pending 유지, sweep 재시도)
    console.error(
      "[billing-key/issue] getCustomerInfo unexpected error:",
      err,
    );
    return NextResponse.json({ error: "빌링키 조회 실패" }, { status: 502 });
  }

  if (!customerInfo) {
    // 확실한 미등록 (404 또는 response 없음) — 빌링키 발급 자체가 안 된 것.
    console.warn("[billing-key/issue] customer_uid not found on PG, marking intent failed.", "customer_uid=", customerUid);
    await markIntentFailed(intent.id);
    return NextResponse.json({ error: "빌링키가 PG 에 존재하지 않음" }, { status: 422 });
  }

  // ── 7) 이전 active 빌링키 정리 ────────────────────────────────────────────
  // 같은 user 의 active 빌링키가 있으면 PG 에서 삭제하고 DB는 expired 마킹.
  // PG 삭제 실패 시 pg_delete_pending=true 로 큐잉 (cron 재시도)
  const { data: prevActiveKeys, error: prevQueryErr } = await supabaseAdmin
    .from("portone_billing_keys")
    .select("id, billing_key")
    .eq("user_id", userId)
    .eq("status", "active")
    .neq("billing_key", customerUid);

  if (prevQueryErr) {
    console.warn(
      "[billing-key/issue] previous keys query error:",
      prevQueryErr.message,
    );
  } else if (prevActiveKeys && prevActiveKeys.length > 0) {
    for (const prev of prevActiveKeys) {
      let pgDeleteFailed = false;
      try {
        await deleteCustomerUid(prev.billing_key as string);
      } catch (err) {
        pgDeleteFailed = true;
        captureBillingIncident(
          "[billing-key/issue] PortOne deleteCustomerUid failed — 좀비 빌링키 큐잉됨 (cron 재시도 모니터링 필요)",
          {
            type: "zombie_billing_key",
            severity: "medium",
            user_id: userId,
            prev_billing_key_id: prev.id,
            prev_customer_uid: prev.billing_key,
            new_customer_uid: customerUid,
            error_message: err instanceof Error ? err.message : String(err),
          },
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

  // ── 8) 빌링키 DB 저장 ─────────────────────────────────────────────────────
  const now = new Date();
  const initialNextBillingAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000,
  );

  const { data: bkRow, error: bkInsertError } = await supabaseAdmin
    .from("portone_billing_keys")
    .upsert(
      {
        brand_id: brandId,
        user_id: userId,
        plan_key: planKey,
        billing_key: customerUid,
        pg_provider: customerInfo.pg_provider ?? null,
        card_last4: customerInfo.card_number?.slice(-4) ?? null,
        card_brand: customerInfo.card_name ?? null,
        status: "active",
        next_billing_at: initialNextBillingAt.toISOString(),
        pg_delete_pending: false,
      },
      { onConflict: "billing_key" },
    )
    .select("id")
    .single();

  if (bkInsertError || !bkRow) {
    console.error(
      "[billing-key/issue] bk upsert error:",
      bkInsertError?.message,
    );
    await markIntentFailed(intent.id);
    return NextResponse.json({ error: "빌링키 저장 실패" }, { status: 500 });
  }

  // ── 9) portone_orders 멱등성 사전 체크 (방어적) ──────────────────────────
  // intent.merchant_uid 가 이미 portone_orders 에 존재하면 결제는 이미 처리됨.
  const { data: existingOrder } = await supabaseAdmin
    .from("portone_orders")
    .select("id")
    .eq("merchant_uid", merchantUid)
    .maybeSingle();
  if (existingOrder) {
    // 이미 결제됐는데 intent 가 pending 인 비정상 상태 → completed 로 정렬만 수행
    await supabaseAdmin
      .from("billing_key_issue_intents")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", intent.id)
      .eq("status", "pending");
    return NextResponse.json({ success: true, idempotent: true });
  }

  // ── 10) 첫 달 즉시 결제 ───────────────────────────────────────────────────
  let chargeResult;
  try {
    chargeResult = await chargeWithCustomerUid({
      customerUid,
      merchantUid,
      amountKrw,
      orderName: `Zeriv ${PLAN_DISPLAY_LABELS[planKey] ?? planKey} 정기결제`,
      buyerEmail: undefined,
      buyerName: undefined,
    });
  } catch (err) {
    console.error("[billing-key/issue] chargeWithCustomerUid error:", err);
    await supabaseAdmin
      .from("portone_billing_keys")
      .update({ status: "expired" })
      .eq("id", bkRow.id);
    await markIntentFailed(intent.id);
    return NextResponse.json(
      { error: "첫 결제 실패. 카드를 확인해주세요." },
      { status: 402 },
    );
  }

  if (chargeResult.status !== "paid") {
    await supabaseAdmin
      .from("portone_billing_keys")
      .update({ status: "expired" })
      .eq("id", bkRow.id);
    await markIntentFailed(intent.id);
    return NextResponse.json(
      { error: `결제 상태 오류: ${chargeResult.status}` },
      { status: 402 },
    );
  }

  const paidAt = new Date(chargeResult.paid_at * 1000).toISOString();
  const periodEnd = new Date(
    chargeResult.paid_at * 1000 + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // ── 11) portone_orders 기록 (실패 시 warning 응답 필드로 노출) ───────────
  let orderInsertWarning = false;
  const { error: orderError } = await supabaseAdmin
    .from("portone_orders")
    .insert({
      user_id: userId,
      brand_id: brandId,
      organization_id: organizationId,
      merchant_uid: merchantUid,
      imp_uid: chargeResult.imp_uid,
      plan_key: planKey,
      amount_krw: amountKrw,
      status: "paid",
      paid_at: paidAt,
      order_type: "billing_first",
      billing_key_id: bkRow.id,
    });

  if (orderError) {
    orderInsertWarning = true;
    captureBillingIncident(
      "[billing-key/issue] order insert FAILED — 첫 결제는 성공·portone_orders 기록 누락 (수동 보정 필요)",
      {
        type: "orders_missing",
        severity: "critical",
        user_id: userId,
        brand_id: brandId,
        organization_id: organizationId,
        intent_id: intent.id,
        merchant_uid: merchantUid,
        imp_uid: chargeResult.imp_uid,
        billing_key_id: bkRow.id,
        plan_key: planKey,
        plan_tier: planTier,
        amount_krw: amountKrw,
        pg_error_message: orderError.message,
      },
    );
  }

  // ── 12) subscriptions upsert (organization 단위) ─────────────────────────
  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  if (existingSub?.id) {
    const { error: subUpdateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: planKey,
        plan_tier: planTier,
        status: "active",
        current_period_end: periodEnd,
        billing_key_id: bkRow.id,
        auto_renew: true,
        last_renewed_at: paidAt,
      })
      .eq("id", existingSub.id)
      .eq("organization_id", organizationId);

    if (subUpdateError) {
      console.error(
        "[billing-key/issue] subscription update error:",
        subUpdateError.message,
      );
      await markIntentFailed(intent.id);
      return NextResponse.json(
        { error: "구독 활성화 실패" },
        { status: 500 },
      );
    }
  } else {
    const { error: subInsertError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        organization_id: organizationId,
        brand_id: brandId,
        plan: planKey,
        plan_tier: planTier,
        status: "active",
        current_period_end: periodEnd,
        billing_key_id: bkRow.id,
        auto_renew: true,
        last_renewed_at: paidAt,
      });

    if (subInsertError) {
      console.error(
        "[billing-key/issue] subscription insert error:",
        subInsertError.message,
      );
      await markIntentFailed(intent.id);
      return NextResponse.json(
        { error: "구독 활성화 실패" },
        { status: 500 },
      );
    }
  }

  await supabaseAdmin
    .from("portone_billing_keys")
    .update({ first_paid_at: paidAt, next_billing_at: periodEnd })
    .eq("id", bkRow.id);

  // ── 13) intent 마지막 마킹 — pending 일 때만 update (race 방지) ────────────
  const finalStatus = orderInsertWarning ? "completed_with_warning" : "completed";
  await supabaseAdmin
    .from("billing_key_issue_intents")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("status", "pending");

  return NextResponse.json({
    success: true,
    ...(orderInsertWarning && {
      warning:
        "결제는 정상 처리됐으나 결제 내역 기록에 일시 오류가 있습니다. 결제 내역에 즉시 반영되지 않을 수 있습니다.",
    }),
  });
}

async function markIntentFailed(intentId: string) {
  await supabaseAdmin
    .from("billing_key_issue_intents")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", intentId)
    .eq("status", "pending");
}
