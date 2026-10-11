import { NextRequest, NextResponse } from "next/server";
import { secureCompare } from "@/lib/secureCompare";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chargeWithCustomerUid, deleteCustomerUid } from "@/lib/portone";
import {
  getPlanPrice,
  getPlanDisplayName,
  toProTier,
  PLAN_DISPLAY_LABELS,
} from "@/lib/plans-brand";
import { captureBillingIncident } from "@/lib/sentry";

/**
 * 결정적 merchant_uid 생성 — 동일 (sub, effective plan/tier, current_period_end) 조합은
 * 항상 같은 merchant_uid 를 만들어 portone_orders.merchant_uid UNIQUE 제약과 결합해
 * 이중 청구를 차단한다.
 *
 * 이중 청구 시나리오 차단:
 *   - Vercel cron retry / 동시 발화
 *   - CRON_SECRET 보유자(GitHub Actions 등) 동시 호출
 *   - 수동 백필 + cron 자연 발화 겹침
 *
 * period_end 가 갱신된 후에는 자연스럽게 새 merchant_uid 가 되어 다음 주기 갱신이 가능.
 * change-plan 의 'proration_*' prefix 와 분리되어 충돌 없음.
 *
 * 길이: 'renew_'(6) + 16 + '_' + plan(<=11) + '_t' + tier(1) + '_' + epoch(10) ≈ 47자
 *       PortOne merchant_uid 한도(80자) 안전.
 */
function buildRenewalMerchantUid(
  subscriptionId: string,
  effectivePlan: string,
  effectivePlanTier: number,
  periodEndIso: string,
): string {
  const periodEndEpoch = Math.floor(new Date(periodEndIso).getTime() / 1000);
  const subShort = subscriptionId.replace(/-/g, "").slice(0, 16);
  return `renew_${subShort}_${effectivePlan}_t${effectivePlanTier}_${periodEndEpoch}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BillingKeyJoin = {
  id: string;
  billing_key: string;
  user_id: string;
  fail_count: number | null;
  status: string;
};

type SubscriptionRow = {
  id: string;
  brand_id: string | null;
  organization_id: string | null;
  plan: string;
  plan_tier: number | null;
  pending_plan: string | null;
  pending_plan_tier: number | null;
  pending_change_at: string | null;
  billing_key_id: string | null;
  current_period_end: string;
  portone_billing_keys: BillingKeyJoin | BillingKeyJoin[] | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !secureCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const safeRenewWindow = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000);

  const { data: subsRaw, error: queryError } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, brand_id, organization_id, plan, plan_tier, pending_plan, pending_plan_tier, pending_change_at, billing_key_id, current_period_end, portone_billing_keys(id, billing_key, user_id, fail_count, status)",
    )
    .eq("status", "active")
    .eq("auto_renew", true)
    .lte("current_period_end", windowEnd.toISOString())
    .gt("current_period_end", now.toISOString())
    .not("billing_key_id", "is", null)
    .not("plan", "in", '("free","studio")')
    .or(
      `last_renewed_at.is.null,last_renewed_at.lt.${safeRenewWindow.toISOString()}`,
    )
    .limit(50);

  if (queryError) {
    console.error("[billing-renewal] query error:", queryError.message);
    return NextResponse.json({ error: "구독 조회 실패" }, { status: 500 });
  }

  const subs = (subsRaw ?? []) as SubscriptionRow[];

  let successCount = 0;
  let failCount = 0;

  for (const sub of subs) {
    const bkData: BillingKeyJoin | null = Array.isArray(
      sub.portone_billing_keys,
    )
      ? (sub.portone_billing_keys[0] ?? null)
      : sub.portone_billing_keys;

    if (!bkData || bkData.status !== "active") {
      failCount++;
      continue;
    }

    // ── 갱신 시 pending_plan 적용 ────────────────────────────────────────
    // 다운그레이드 예약이 있는 경우, 새 plan 가격으로 갱신하고
    // 결제 성공 시점에 plan/plan_tier 를 새 값으로 마이그레이션한다.
    const effectivePlan = sub.pending_plan ?? sub.plan;
    const effectivePlanTier =
      sub.pending_plan != null
        ? toProTier(sub.pending_plan_tier)
        : toProTier(sub.plan_tier);

    if (effectivePlan === "studio" || effectivePlan === "free") {
      console.warn(
        "[billing-renewal] skipping non-billable plan:",
        effectivePlan,
      );
      failCount++;
      continue;
    }

    const amountKrw = getPlanPrice(effectivePlan, effectivePlanTier);
    if (!amountKrw || amountKrw <= 0) {
      console.warn(
        "[billing-renewal] unknown or non-billable plan:",
        effectivePlan,
      );
      failCount++;
      continue;
    }

    // ── 멱등성: 결정적 merchant_uid + portone_orders pending insert ─────
    // 이중 청구 차단의 핵심. 같은 (sub, plan/tier, period_end) 조합은 항상 동일
    // merchant_uid 가 되어 UNIQUE 제약이 두 번째 호출을 23505 로 막는다.
    const merchantUid = buildRenewalMerchantUid(
      sub.id,
      effectivePlan,
      effectivePlanTier,
      sub.current_period_end,
    );

    const orderName = `Zeriv ${PLAN_DISPLAY_LABELS[effectivePlan] ?? effectivePlan} 구독 갱신${
      sub.pending_plan
        ? ` (${getPlanDisplayName(effectivePlan, effectivePlanTier)})`
        : ""
    }`;

    // 1) pending row 를 chargeWithCustomerUid 호출 전에 먼저 insert.
    //    UNIQUE 위반(23505) 시 다른 cron 인스턴스가 같은 갱신을 이미 처리 중/완료
    //    → 결제 호출 자체를 건너뛰어 이중 청구를 차단한다.
    const { error: pendingErr } = await supabaseAdmin
      .from("portone_orders")
      .insert({
        user_id: bkData.user_id,
        brand_id: sub.brand_id,
        organization_id: sub.organization_id,
        merchant_uid: merchantUid,
        plan_key: effectivePlan,
        amount_krw: amountKrw,
        status: "pending",
        order_type: "billing_renewal",
        billing_key_id: bkData.id,
      });

    if (pendingErr) {
      const code = (pendingErr as { code?: string }).code;
      if (code === "23505") {
        // 동일 갱신이 이미 처리 중이거나 완료됨. successCount/failCount 어느 쪽도
        // 증가시키지 않는다 — 이번 실행이 아니라 직전(또는 동시) 실행이 결과를 카운트했다.
        console.warn(
          "[billing-renewal] duplicate renewal skipped (idempotent). sub_id=",
          sub.id,
          "merchant_uid=",
          merchantUid,
        );
        continue;
      }
      // CHECK 위반(23514) 등 스키마 정합성 문제. fail 로 분류하고 다음 sub.
      console.error(
        "[billing-renewal] portone_orders pending insert failed. sub_id=",
        sub.id,
        "merchant_uid=",
        merchantUid,
        "error=",
        pendingErr.message,
      );
      failCount++;
      continue;
    }

    try {
      // 2) PortOne 결제 호출
      const result = await chargeWithCustomerUid({
        customerUid: bkData.billing_key,
        merchantUid,
        amountKrw,
        orderName,
      });

      if (result.status !== "paid") {
        throw new Error(`status=${result.status}`);
      }

      const paidAt = new Date(result.paid_at * 1000).toISOString();
      // newPeriodEnd 는 결제 시각이 아니라 기존 current_period_end 기준 +30일.
      // cron 이 만료일 직전에 발화해도 사용자가 항상 정확히 30일 권한을 보장받음.
      const newPeriodEnd = new Date(
        new Date(sub.current_period_end).getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // pending 적용 시: plan/plan_tier 마이그레이션 + pending 컬럼 클리어
      const subUpdate: Record<string, unknown> = {
        current_period_end: newPeriodEnd,
        last_renewed_at: paidAt,
      };
      if (sub.pending_plan != null) {
        subUpdate.plan = effectivePlan;
        subUpdate.plan_tier = effectivePlanTier;
        subUpdate.pending_plan = null;
        subUpdate.pending_plan_tier = null;
        subUpdate.pending_change_at = null;
      }

      // 3) portone_orders 를 paid 로 마킹 (race-safe: status='pending' 일 때만 update)
      //    + subscriptions update + billing_keys update 병렬 실행
      const [orderRes, subRes, bkRes] = await Promise.all([
        supabaseAdmin
          .from("portone_orders")
          .update({
            imp_uid: result.imp_uid,
            status: "paid",
            paid_at: paidAt,
          })
          .eq("merchant_uid", merchantUid)
          .eq("status", "pending"),
        supabaseAdmin.from("subscriptions").update(subUpdate).eq("id", sub.id),
        supabaseAdmin
          .from("portone_billing_keys")
          .update({ fail_count: 0, next_billing_at: newPeriodEnd })
          .eq("id", bkData.id),
      ]);

      // M2: subscriptions.update 실패는 다음 cron 실행 시 같은 구독을 재청구할 위험이 있으므로
      //     명시적 ERROR 로그 + failed 카운트로 분류 (sweep / 모니터링이 잡을 수 있도록).
      //     단, 결정적 merchant_uid 덕에 다음 cron 도 동일 merchant_uid 로 23505 에 막혀
      //     PortOne 재청구는 일어나지 않는다 (현재 period_end 가 동일하다는 전제). 그럼에도
      //     sub.current_period_end 가 미래로 이동하지 않으면 sub 가 cron 윈도우에 계속 남아
      //     운영 부담이 되므로 ERROR 로 표시.
      if (subRes.error) {
        captureBillingIncident(
          "[billing-renewal] CRITICAL: subscriptions update failed after successful charge — possible double-charge on next run",
          {
            type: "sub_update_failed",
            severity: "critical",
            sub_id: sub.id,
            organization_id: sub.organization_id,
            brand_id: sub.brand_id,
            user_id: bkData.user_id,
            merchant_uid: merchantUid,
            imp_uid: result.imp_uid,
            effective_plan: effectivePlan,
            effective_plan_tier: effectivePlanTier,
            amount_krw: amountKrw,
            pg_error_message: subRes.error.message,
          },
        );
        failCount++;
      } else {
        successCount++;
      }

      if (orderRes.error) {
        console.warn(
          "[billing-renewal] portone_orders update to paid failed (charge succeeded). merchant_uid=",
          merchantUid,
          "error=",
          orderRes.error.message,
        );
      }
      if (bkRes.error) {
        console.warn(
          "[billing-renewal] billing_keys update failed (charge succeeded). bk_id=",
          bkData.id,
          "error=",
          bkRes.error.message,
        );
      }
    } catch (err) {
      console.error("[billing-renewal] charge failed for sub", sub.id, err);

      // pending row 를 failed 로 마킹 (race-safe).
      // 동일 (sub, plan/tier, period_end) 재시도는 23505 로 차단되지만,
      // period_end 가 갱신되거나 plan 이 바뀌면 새 merchant_uid 로 정상 재시도 가능.
      const { error: failUpdateErr } = await supabaseAdmin
        .from("portone_orders")
        .update({ status: "failed" })
        .eq("merchant_uid", merchantUid)
        .eq("status", "pending");
      if (failUpdateErr) {
        console.warn(
          "[billing-renewal] portone_orders failed-mark update error. merchant_uid=",
          merchantUid,
          "error=",
          failUpdateErr.message,
        );
      }

      const newFailCount = (bkData.fail_count ?? 0) + 1;

      if (newFailCount >= 3) {
        await Promise.all([
          supabaseAdmin
            .from("portone_billing_keys")
            .update({ status: "expired", fail_count: newFailCount })
            .eq("id", bkData.id),
          supabaseAdmin
            .from("subscriptions")
            .update({ status: "cancelled", auto_renew: false })
            .eq("id", sub.id),
        ]);
      } else {
        await supabaseAdmin
          .from("portone_billing_keys")
          .update({ fail_count: newFailCount })
          .eq("id", bkData.id);
      }
      failCount++;
    }
  }

  // ── pg_delete_pending 재시도 ────────────────────────────────────────────
  // PG(아임포트) 측 customer_uid 삭제가 실패하여 좀비 빌링키로 남은 행을 정리한다.
  // 빌링키 발급 시 동시에 처리되지 못한 경우의 fallback. 한 회 호출당 최대 50건.
  let pgRetrySuccess = 0;
  let pgRetryFailed = 0;
  const { data: pendingDeletes } = await supabaseAdmin
    .from("portone_billing_keys")
    .select("id, billing_key")
    .eq("pg_delete_pending", true)
    .limit(50);

  if (pendingDeletes && pendingDeletes.length > 0) {
    for (const row of pendingDeletes) {
      try {
        await deleteCustomerUid(row.billing_key as string);
        await supabaseAdmin
          .from("portone_billing_keys")
          .update({ pg_delete_pending: false })
          .eq("id", row.id as string);
        pgRetrySuccess++;
      } catch (err) {
        console.error(
          "[billing-renewal] pg_delete retry failed for",
          row.billing_key,
          err,
        );
        pgRetryFailed++;
      }
    }
  }

  // ── 만료 sweep ───────────────────────────────────────────────────────────
  // auto_renew=false + cancel_requested_at != NULL + period 지난 active 구독을
  // status='cancelled' 로 마킹한다. 사용자가 "구독 해지" 후 만료 시각이 지나면
  // 자동으로 free 플랜으로 다운그레이드되도록 하는 단일 sweep 지점.
  //
  // H2: cancel_requested_at IS NOT NULL 필터를 반드시 함께 적용한다.
  //     auto_renew=false 만으로는 "결제 3회 실패 후 강제 만료" 케이스가 섞여서
  //     해지 의도가 없는 사용자까지 cancelled 로 마킹될 수 있다.
  //     마이그레이션의 partial index (subscriptions_cancel_expiry_idx) 의도와도 일치.
  let expiredCount = 0;
  const { data: expiredRows, error: expiredErr } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("status", "active")
    .eq("auto_renew", false)
    .not("cancel_requested_at", "is", null)
    .lte("current_period_end", now.toISOString())
    .select("id");

  if (expiredErr) {
    console.error(
      "[billing-renewal] expiry sweep error:",
      expiredErr.message,
    );
  } else {
    expiredCount = expiredRows?.length ?? 0;
  }

  return NextResponse.json({
    processed: subs.length,
    success: successCount,
    failed: failCount,
    pgRetrySuccess,
    pgRetryFailed,
    expired: expiredCount,
  });
}
