import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chargeWithCustomerUid } from "@/lib/portone";
import {
  getPlanPrice,
  getPlanRank,
  getPlanDisplayName,
  toProTier,
  KRW_BILLABLE_PLANS,
  type KrwBillablePlan,
} from "@/lib/plans-brand";
import { captureBillingIncident } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/portone/subscription/change-plan
 *
 * 활성 KRW 구독의 플랜을 변경한다.
 *
 * 입력:
 *   { organizationId, targetPlan, targetPlanTier?, revertPending?, dryRun? }
 *
 * 분기:
 *   - revertPending=true:
 *       pending_plan/pending_plan_tier/pending_change_at 클리어. 청구 X.
 *   - dryRun=true (업그레이드/다운그레이드 미리보기):
 *       서버에서 산정한 prorationAmount / nextBillingAmount / effectiveAt 만 반환.
 *       결제·DB 변경 없음. 다이얼로그가 정확한 금액을 표시하기 위해 사용.
 *   - 업그레이드 (currentPrice < targetPrice):
 *       남은 일수 기반 일할 차액 즉시 청구 → 결제 성공 시 plan/plan_tier 즉시 변경.
 *       current_period_end 는 보존.
 *   - 다운그레이드 (currentPrice > targetPrice):
 *       pending_plan/pending_plan_tier/pending_change_at 마킹. 청구 X.
 *   - 동일 가격: 400 ("변경 사항이 없습니다")
 *
 * 보안 / 멱등성:
 *   - 가격은 서버에서만 산정 (getPlanPrice). 클라이언트 amount 신뢰 X.
 *   - 권한: organization owner / admin.
 *   - 빌링키 expired → 400.
 *   - 만료된 구독 (current_period_end < now) → 업그레이드 차단 (정책 위반 방어).
 *   - 활성 구독 update 는 WHERE status='active' AND id=... 조건부로 race 방지.
 *   - 업그레이드 차액 결제는 결정적 merchant_uid (proration_<subId>_<plan>_<tier>_<periodEndEpoch>)
 *     + portone_orders pending insert 로 멱등성 보장. 동일 입력은 동일 merchant_uid 가 되어
 *     UNIQUE 제약이 두 번째 요청을 막는다 (이중 청구 방지).
 */

type ChangePlanBody = {
  organizationId?: string;
  targetPlan?: string;
  targetPlanTier?: number;
  revertPending?: boolean;
  dryRun?: boolean;
};

type ActiveSubscriptionRow = {
  id: string;
  organization_id: string;
  brand_id: string | null;
  plan: string;
  plan_tier: number | null;
  status: string;
  auto_renew: boolean;
  current_period_end: string | null;
  billing_key_id: string | null;
  pending_plan: string | null;
  pending_plan_tier: number | null;
  pending_change_at: string | null;
  cancel_requested_at: string | null;
  user_id?: string | null;
};

type BillingKeyMeta = {
  id: string;
  billing_key: string;
  status: string;
  user_id: string;
};

/**
 * 결정적 merchant_uid 생성 — 동일 (sub, target plan/tier, period_end) 조합은
 * 항상 같은 merchant_uid 를 만들어 portone_orders.merchant_uid UNIQUE 제약과
 * 결합해 이중 청구를 차단한다.
 *
 * period_end_epoch 를 키에 포함시켜 갱신(period_end 변경) 후에는 자연스럽게
 * 새 merchant_uid 가 되도록 했다.
 */
function buildProrationMerchantUid(
  subscriptionId: string,
  targetPlan: string,
  targetPlanTier: number,
  periodEndIso: string,
): string {
  const periodEndEpoch = Math.floor(new Date(periodEndIso).getTime() / 1000);
  const subShort = subscriptionId.replace(/-/g, "").slice(0, 16);
  return `proration_${subShort}_${targetPlan}_t${targetPlanTier}_${periodEndEpoch}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChangePlanBody;
  try {
    body = (await req.json()) as ChangePlanBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const organizationId = body.organizationId;
  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json(
      { error: "organizationId 가 필요합니다." },
      { status: 400 },
    );
  }

  // ── 권한 확인 ──────────────────────────────────────────────────────────
  const { data: memberRow, error: memberError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    console.error(
      "[subscription/change-plan] member lookup error:",
      memberError.message,
    );
    return NextResponse.json(
      { error: "권한 확인에 실패했습니다." },
      { status: 500 },
    );
  }
  if (!memberRow || !["owner", "admin"].includes(memberRow.role as string)) {
    return NextResponse.json(
      { error: "플랜 변경 권한이 없습니다." },
      { status: 403 },
    );
  }

  // ── 활성 구독 조회 ────────────────────────────────────────────────────
  const { data: subRow, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, organization_id, brand_id, plan, plan_tier, status, auto_renew, current_period_end, billing_key_id, pending_plan, pending_plan_tier, pending_change_at, cancel_requested_at",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (subError) {
    console.error(
      "[subscription/change-plan] subscription lookup error:",
      subError.message,
    );
    return NextResponse.json(
      { error: "구독 조회에 실패했습니다." },
      { status: 500 },
    );
  }
  if (!subRow) {
    return NextResponse.json(
      { error: "활성 구독이 없습니다." },
      { status: 404 },
    );
  }

  const sub = subRow as ActiveSubscriptionRow;
  const nowIso = new Date().toISOString();
  const dryRun = body.dryRun === true;

  // ── revertPending: 다운그레이드 예약 취소 ────────────────────────────
  if (body.revertPending === true) {
    if (!sub.pending_plan) {
      return NextResponse.json(
        { error: "예약된 플랜 변경이 없습니다." },
        { status: 409 },
      );
    }
    const { data: updated, error: revertErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        pending_plan: null,
        pending_plan_tier: null,
        pending_change_at: null,
        updated_at: nowIso,
      })
      .eq("id", sub.id)
      .eq("status", "active")
      .select("id, plan, plan_tier")
      .single();

    if (revertErr || !updated) {
      console.error(
        "[subscription/change-plan] revertPending error:",
        revertErr?.message,
      );
      return NextResponse.json(
        { error: "예약 취소에 실패했습니다." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      kind: "revert",
      effectiveAt: nowIso,
    });
  }

  // ── targetPlan / targetPlanTier 검증 ─────────────────────────────────
  const targetPlanRaw = body.targetPlan;
  if (!targetPlanRaw || typeof targetPlanRaw !== "string") {
    return NextResponse.json(
      { error: "targetPlan 이 필요합니다." },
      { status: 400 },
    );
  }
  if (!(KRW_BILLABLE_PLANS as readonly string[]).includes(targetPlanRaw)) {
    return NextResponse.json(
      { error: `지원하지 않는 플랜입니다: ${targetPlanRaw}` },
      { status: 400 },
    );
  }
  const targetPlan = targetPlanRaw as KrwBillablePlan;
  const targetPlanTier = targetPlan === "pro" ? toProTier(body.targetPlanTier) : 1;

  // ── 가격 산정 (서버 권한) ────────────────────────────────────────────
  const targetPrice = getPlanPrice(targetPlan, targetPlanTier);
  if (targetPrice <= 0) {
    return NextResponse.json(
      { error: "결제 가능한 플랜이 아닙니다." },
      { status: 400 },
    );
  }
  const currentPlan = sub.plan;
  const currentPlanTier = toProTier(sub.plan_tier);
  const currentPrice = getPlanPrice(currentPlan, currentPlanTier);
  const currentRank = getPlanRank(currentPlan, currentPlanTier);
  const targetRank = getPlanRank(targetPlan, targetPlanTier);

  // ── 변경 사항 없음 ─────────────────────────────────────────────────────
  if (
    currentPlan === targetPlan &&
    currentPlanTier === targetPlanTier
  ) {
    return NextResponse.json(
      { error: "변경 사항이 없습니다." },
      { status: 400 },
    );
  }

  // ── 빌링키 검증 (업그레이드는 즉시 결제 필요, 다운그레이드도 다음 결제일 청구 보장 위해 active 요구) ──
  if (!sub.billing_key_id) {
    return NextResponse.json(
      { error: "결제수단이 등록되어 있지 않습니다." },
      { status: 400 },
    );
  }
  const { data: bkRowRaw, error: bkErr } = await supabaseAdmin
    .from("portone_billing_keys")
    .select("id, billing_key, status, user_id")
    .eq("id", sub.billing_key_id)
    .maybeSingle();
  if (bkErr || !bkRowRaw) {
    console.error(
      "[subscription/change-plan] billing key lookup error:",
      bkErr?.message,
    );
    return NextResponse.json(
      { error: "결제수단 조회에 실패했습니다." },
      { status: 500 },
    );
  }
  const bk = bkRowRaw as BillingKeyMeta;
  if (bk.status !== "active") {
    return NextResponse.json(
      { error: "결제수단이 만료되어 플랜 변경이 불가능합니다." },
      { status: 400 },
    );
  }

  // ── 다운그레이드 ────────────────────────────────────────────────────────
  if (targetRank < currentRank) {
    // 해지 예약과 충돌하는 다운그레이드 → 해지 우선 정책. 명시적 에러.
    if (!sub.auto_renew || sub.cancel_requested_at) {
      return NextResponse.json(
        { error: "해지 예약된 구독은 다운그레이드할 수 없습니다. 먼저 해지를 철회해주세요." },
        { status: 409 },
      );
    }

    if (dryRun) {
      return NextResponse.json({
        kind: "downgrade",
        prorationAmount: 0,
        nextBillingAmount: targetPrice,
        effectiveAt: sub.current_period_end,
        dryRun: true,
      });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        pending_plan: targetPlan,
        pending_plan_tier: targetPlanTier,
        pending_change_at: sub.current_period_end,
        updated_at: nowIso,
      })
      .eq("id", sub.id)
      .eq("status", "active")
      .select("id, current_period_end")
      .single();

    if (updateErr || !updated) {
      console.error(
        "[subscription/change-plan] downgrade update error:",
        updateErr?.message,
      );
      return NextResponse.json(
        { error: "다운그레이드 예약에 실패했습니다." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      kind: "downgrade",
      prorationAmount: 0,
      nextBillingAmount: targetPrice,
      effectiveAt: updated.current_period_end,
    });
  }

  // ── 업그레이드 ─────────────────────────────────────────────────────────
  // 해지 예약 상태에서도 업그레이드 시도가 들어오면 정책상 "즉시 활성 구독으로 복원"
  // — 해지를 철회하고 업그레이드 처리하는 게 사용자 의도에 가깝다.

  if (!sub.current_period_end) {
    return NextResponse.json(
      { error: "구독 기간 정보가 없어 업그레이드할 수 없습니다." },
      { status: 500 },
    );
  }

  const periodEndMs = new Date(sub.current_period_end).getTime();
  const nowMs = Date.now();

  // ── M1: 만료된 구독 업그레이드 차단 ──────────────────────────────────
  if (periodEndMs <= nowMs) {
    return NextResponse.json(
      {
        error:
          "이미 만료된 구독은 업그레이드할 수 없습니다. 새로 결제해주세요.",
      },
      { status: 400 },
    );
  }

  const remainingDays = Math.max(
    1,
    Math.ceil((periodEndMs - nowMs) / 86_400_000),
  );

  // 일할 차액 — 30일 기준
  const prorationAmount = Math.ceil(
    ((targetPrice - currentPrice) * remainingDays) / 30,
  );

  // ── dryRun: 실제 결제 없이 견적만 반환 ───────────────────────────────
  if (dryRun) {
    return NextResponse.json({
      kind: "upgrade",
      prorationAmount: Math.max(0, prorationAmount),
      nextBillingAmount: targetPrice,
      effectiveAt: nowIso,
      dryRun: true,
    });
  }

  // ── 차액이 0 이하면 plan만 변경 (정책 위반 케이스 방어) ─────────────
  if (prorationAmount <= 0) {
    const { data: updatedSub, error: noChargeUpdateErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: targetPlan,
        plan_tier: targetPlanTier,
        // 해지 예약 자동 철회 (사용자 의도)
        auto_renew: true,
        cancel_requested_at: null,
        // 다운그레이드 예약 클리어 (혹시 모를 잔여 상태)
        pending_plan: null,
        pending_plan_tier: null,
        pending_change_at: null,
        updated_at: nowIso,
      })
      .eq("id", sub.id)
      .eq("status", "active")
      .select("id, current_period_end")
      .single();

    if (noChargeUpdateErr || !updatedSub) {
      console.error(
        "[subscription/change-plan] zero-proration update error:",
        noChargeUpdateErr?.message,
      );
      return NextResponse.json(
        { error: "플랜 변경에 실패했습니다." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      kind: "upgrade",
      prorationAmount: 0,
      nextBillingAmount: targetPrice,
      effectiveAt: nowIso,
    });
  }

  // ── 멱등성: 결정적 merchant_uid + portone_orders pending insert ─────
  const merchantUid = buildProrationMerchantUid(
    sub.id,
    targetPlan,
    targetPlanTier,
    sub.current_period_end,
  );

  // 1) pending row 를 먼저 insert. UNIQUE 제약이 두 번째 요청을 막아 이중 청구 차단.
  const { data: pendingOrder, error: pendingErr } = await supabaseAdmin
    .from("portone_orders")
    .insert({
      user_id: bk.user_id,
      brand_id: sub.brand_id,
      organization_id: organizationId,
      merchant_uid: merchantUid,
      plan_key: targetPlan,
      amount_krw: prorationAmount,
      status: "pending",
      order_type: "upgrade_proration",
      billing_key_id: bk.id,
    })
    .select("id, status")
    .single();

  if (pendingErr || !pendingOrder) {
    // UNIQUE 위반(23505) → 동일 입력의 동시 호출 또는 재시도
    const code = (pendingErr as { code?: string } | null)?.code;
    if (code === "23505") {
      // 기존 row 상태를 조회해 응답을 분기한다.
      const { data: existing } = await supabaseAdmin
        .from("portone_orders")
        .select("status, paid_at, amount_krw")
        .eq("merchant_uid", merchantUid)
        .maybeSingle();

      if (existing?.status === "paid") {
        // 이미 청구·갱신 완료된 멱등 재시도 — 200 으로 동일 결과 응답.
        return NextResponse.json({
          kind: "upgrade",
          prorationAmount,
          nextBillingAmount: targetPrice,
          effectiveAt: existing.paid_at ?? nowIso,
          idempotent: true,
        });
      }
      // pending 또는 failed 상태 — 동시 진행 중이거나 직전 실패.
      return NextResponse.json(
        {
          error:
            "동일한 플랜 변경 요청이 이미 처리 중이거나 직전에 실패했습니다. 잠시 후 다시 시도해주세요.",
        },
        { status: 409 },
      );
    }
    console.error(
      "[subscription/change-plan] pending order insert failed:",
      pendingErr?.message,
    );
    return NextResponse.json(
      { error: "플랜 변경 준비에 실패했습니다." },
      { status: 500 },
    );
  }

  // 2) PortOne 일할 차액 결제
  let chargeResult;
  try {
    chargeResult = await chargeWithCustomerUid({
      customerUid: bk.billing_key,
      merchantUid,
      amountKrw: prorationAmount,
      orderName: `Zeriv ${getPlanDisplayName(targetPlan, targetPlanTier)} 업그레이드 차액`,
    });
  } catch (chargeErr) {
    console.error(
      "[subscription/change-plan] proration charge failed:",
      chargeErr,
    );
    // pending row 를 failed 로 마킹 → 동일 (sub, plan/tier, period) 재시도는 409 로 막는다.
    // 다른 plan 으로 바꾸거나 period 가 갱신되면 새 merchant_uid 라 재시도 가능.
    await supabaseAdmin
      .from("portone_orders")
      .update({ status: "failed" })
      .eq("merchant_uid", merchantUid);
    return NextResponse.json(
      {
        error:
          "차액 결제에 실패했습니다. 카드를 확인하고 다시 시도해주세요.",
      },
      { status: 402 },
    );
  }

  if (chargeResult.status !== "paid") {
    // I1: 'cancelled', 'vbankIssued', 'failed' 등 'paid' 외 모든 상태를 실패로 처리.
    await supabaseAdmin
      .from("portone_orders")
      .update({ status: "failed" })
      .eq("merchant_uid", merchantUid);
    return NextResponse.json(
      {
        error: `결제가 완료되지 않았습니다 (상태: ${chargeResult.status}). 카드를 확인하고 다시 시도해주세요.`,
      },
      { status: 402 },
    );
  }

  const paidAt = new Date(chargeResult.paid_at * 1000).toISOString();

  // ── 3) portone_orders 를 paid 로 마킹 ───────────────────────────────
  const { error: orderUpdateErr } = await supabaseAdmin
    .from("portone_orders")
    .update({
      imp_uid: chargeResult.imp_uid,
      status: "paid",
      paid_at: paidAt,
    })
    .eq("merchant_uid", merchantUid);

  if (orderUpdateErr) {
    // 결제는 성공, orders 갱신 실패 — sub update 는 진행하되 운영 알림 필요
    captureBillingIncident(
      "[subscription/change-plan] portone_orders update FAILED after proration charge — 차액 결제는 성공·orders 장부 누락",
      {
        type: "orders_missing",
        severity: "high",
        sub_id: sub.id,
        organization_id: organizationId,
        brand_id: sub.brand_id,
        user_id: bk.user_id,
        merchant_uid: merchantUid,
        imp_uid: chargeResult.imp_uid,
        target_plan: targetPlan,
        target_plan_tier: targetPlanTier,
        proration_amount_krw: prorationAmount,
        pg_error_message: orderUpdateErr.message,
      },
    );
  }

  // ── 4) subscriptions update — current_period_end 보존 ───────────────
  const { data: updatedSub, error: subUpdateErr } = await supabaseAdmin
    .from("subscriptions")
    .update({
      plan: targetPlan,
      plan_tier: targetPlanTier,
      // 업그레이드는 사용자 의도가 "이 플랜을 계속 쓰겠다" 이므로 해지 자동 철회
      auto_renew: true,
      cancel_requested_at: null,
      // 다운그레이드 예약이 있었다면 클리어
      pending_plan: null,
      pending_plan_tier: null,
      pending_change_at: null,
      updated_at: nowIso,
    })
    .eq("id", sub.id)
    .eq("status", "active")
    .select("id, plan, plan_tier, current_period_end")
    .single();

  if (subUpdateErr || !updatedSub) {
    // 결제는 성공했는데 sub update 실패 — 매우 드문 케이스
    console.error(
      "[subscription/change-plan] sub update FAILED after charge succeeded. sub_id=",
      sub.id,
      "error=",
      subUpdateErr?.message,
    );
    return NextResponse.json(
      {
        error:
          "차액 결제는 완료됐으나 구독 갱신에 실패했습니다. 잠시 후 결제 내역을 확인해주세요.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    kind: "upgrade",
    prorationAmount,
    nextBillingAmount: targetPrice,
    effectiveAt: nowIso,
  });
}
