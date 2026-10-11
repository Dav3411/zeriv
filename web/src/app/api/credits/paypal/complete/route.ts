import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { capturePayPalOrder, getPayPalSubscription } from "@/lib/paypal";
import { getPlan } from "@/lib/plans";
import { safeNext } from "@/lib/safeNext";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * 쿠키 세션이 있으면 해당 사용자 ID를 반환한다.
 * 세션이 없거나 파싱 실패 시 null 반환.
 *
 * 호출 측은 null 인 경우 반드시 로그인 redirect 로 처리해야 한다.
 * (구버전은 세션 없음을 "검증 skip" 으로 통과시켜 IDOR — 임의 victim 의
 *  paypal_subscriptions/orders 활성화 — 가 가능했음. S2-1 [H-1] 참조.)
 */
async function getSessionUserId(req: Request): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const tempClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { cookie: cookieHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
    } = await tempClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function addCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return false;
  const { error } = await supabaseAdmin.rpc("add_credits_atomic", {
    p_user_id: userId,
    p_amount: amount,
  });
  return !error;
}

async function shouldDeferDowngradeSwitch(
  userId: string,
  nextPlanId: string,
): Promise<boolean> {
  const { data: currentSub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("plan_id, period_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  const nowIso = new Date().toISOString();
  if (!currentSub?.period_ends_at || currentSub.period_ends_at <= nowIso)
    return false;
  const currentPlan = getPlan(String(currentSub.plan_id ?? ""));
  const nextPlan = getPlan(String(nextPlanId ?? ""));
  if (!currentPlan || !nextPlan) return false;
  return nextPlan.credits < currentPlan.credits;
}

/**
 * GET /api/credits/paypal/complete?token=ORDER_ID
 * PayPal redirects here after buyer approval. We capture the order and add credits.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Subscription return: subscription_id (I-xxx), ba_token, and token (order-like) can all be present. Use subscription_id first for subscription lookup.
  const subscriptionId =
    url.searchParams.get("subscription_id") ??
    url.searchParams.get("ba_token") ??
    url.searchParams.get("token");
  const orderToken = url.searchParams.get("token");
  const token = subscriptionId ?? orderToken;
  const rawBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  const baseUrl = rawBase.startsWith("http") ? rawBase : `https://${rawBase}`;
  const creditsUrl = `${baseUrl.replace(/\/$/, "")}/pricing`;

  if (!token) {
    console.error("PayPal complete: missing token.");
    return NextResponse.redirect(`${creditsUrl}?error=missing_token`);
  }

  // S2-1 [H-1]: 세션이 없으면 즉시 로그인 redirect.
  // 정상 사용자는 PayPal 인증 후 쿠키 세션이 살아있는 상태로 돌아온다.
  // 구독 활성화는 PayPal webhook (BILLING.SUBSCRIPTION.ACTIVATED) 이 idempotent 하게
  // 처리하므로 redirect handler 가 통과 못 해도 손실 없음.
  // 세션 없음을 통과시키면 임의 사용자가 victim 의 token 으로 활성화 → IDOR.
  const sessionUserId = await getSessionUserId(req);
  if (sessionUserId === null) {
    // url.pathname + url.search 는 항상 root-relative ("/api/...") 이지만
    // defense-in-depth 로 safeNext 를 통과시켜 검증.
    const nextRaw = url.pathname + url.search;
    const nextSafe = safeNext(nextRaw) || "/pricing";
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(nextSafe)}`, req.url),
    );
  }

  const { data: subRow } = await supabaseAdmin
    .from("paypal_subscriptions")
    .select("id, user_id, plan_id, credits, amount_usd, status")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();

  if (subRow) {
    // 세션은 위에서 이미 강제했으므로 mismatch 만 검사 (sessionUserId !== null 보장).
    if (sessionUserId !== subRow.user_id) {
      return NextResponse.redirect(`${creditsUrl}?error=unauthorized`);
    }

    if (subRow.status === "active") {
      return NextResponse.redirect(`${creditsUrl}?success=1`);
    }
    if (!subscriptionId) {
      return NextResponse.redirect(`${creditsUrl}?error=missing_token`);
    }
    try {
      const sub = await getPayPalSubscription(subscriptionId);
      if (sub.status === "ACTIVE") {
        const now = new Date().toISOString();
        console.info(
          "PayPal complete: subscription ACTIVE, updating",
          subscriptionId,
        );
        await supabaseAdmin
          .from("paypal_subscriptions")
          .update({ status: "active", activated_at: now })
          .eq("subscription_id", subscriptionId)
          .eq("status", "pending");
        await supabaseAdmin.rpc("record_subscription_first_payment", {
          p_subscription_id: subscriptionId,
          p_user_id: subRow.user_id,
          p_plan_id: subRow.plan_id,
          p_credits: subRow.credits,
          p_amount_usd: Number(subRow.amount_usd) || 0,
          p_paid_at: now,
          p_paypal_sale_id: null,
        });
        const deferDowngrade = await shouldDeferDowngradeSwitch(
          subRow.user_id,
          subRow.plan_id,
        );
        if (!deferDowngrade) {
          const periodEndsAt = new Date();
          periodEndsAt.setDate(periodEndsAt.getDate() + 30);
          await supabaseAdmin.from("user_subscriptions").upsert(
            {
              user_id: subRow.user_id,
              plan_id: subRow.plan_id,
              period_ends_at: periodEndsAt.toISOString(),
              updated_at: now,
            },
            { onConflict: "user_id" },
          );
        }
        return NextResponse.redirect(`${creditsUrl}?success=1`);
      }
      if (sub.status === "APPROVAL_PENDING" || sub.status === "APPROVED") {
        console.info(
          "PayPal complete: subscription not yet ACTIVE",
          sub.status,
          subscriptionId,
        );
        // P1-2: success=1 은 크레딧이 들어왔다는 오해를 줌. pending=1 로 분리.
        // 결과 UI 페이지(/pricing) 갱신은 S3-1 에서 별도 처리 예정.
        return NextResponse.redirect(`${creditsUrl}?pending=1`);
      }
      console.warn(
        "PayPal complete: subscription status unexpected",
        sub.status,
        subscriptionId,
      );
    } catch (e) {
      console.error("PayPal subscription complete error:", e);
      return NextResponse.redirect(`${creditsUrl}?error=subscription_failed`);
    }
    return NextResponse.redirect(`${creditsUrl}?success=1`);
  }

  const orderLookupId = orderToken ?? subscriptionId;
  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("paypal_orders")
    .select("id, user_id, plan_id, credits, status")
    .eq("order_id", orderLookupId)
    .maybeSingle();

  if (orderErr || !orderRow) {
    return NextResponse.redirect(`${creditsUrl}?error=order_not_found`);
  }

  // 세션은 함수 진입부에서 이미 강제했으므로 mismatch 만 검사.
  if (sessionUserId !== orderRow.user_id) {
    return NextResponse.redirect(`${creditsUrl}?error=unauthorized`);
  }

  if (orderRow.status === "captured") {
    return NextResponse.redirect(`${creditsUrl}?success=1`);
  }
  if (orderRow.status === "capturing") {
    return NextResponse.redirect(`${creditsUrl}?error=processing`);
  }

  const orderId = orderToken ?? subscriptionId;
  if (!orderId) {
    return NextResponse.redirect(`${creditsUrl}?error=order_not_found`);
  }

  // pending → capturing 전이로 DB 레벨 락 획득. 한 번에 한 요청만 통과한다.
  const { data: lockRow, error: lockErr } = await supabaseAdmin
    .from("paypal_orders")
    .update({ status: "capturing" })
    .eq("order_id", orderId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (lockErr) {
    console.error("PayPal complete: lock acquire error", lockErr);
    return NextResponse.redirect(`${creditsUrl}?error=capture_failed`);
  }
  if (!lockRow) {
    const { data: latest } = await supabaseAdmin
      .from("paypal_orders")
      .select("status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (latest?.status === "captured") {
      return NextResponse.redirect(`${creditsUrl}?success=1`);
    }
    if (latest?.status === "capturing") {
      return NextResponse.redirect(`${creditsUrl}?error=processing`);
    }
    if (latest?.status === "failed") {
      return NextResponse.redirect(`${creditsUrl}?error=capture_failed`);
    }
    return NextResponse.redirect(`${creditsUrl}?error=capture_failed`);
  }

  try {
    const { status } = await capturePayPalOrder(orderId);
    if (status !== "COMPLETED") {
      await supabaseAdmin
        .from("paypal_orders")
        .update({ status: "failed" })
        .eq("order_id", orderId)
        .eq("status", "capturing");
      return NextResponse.redirect(`${creditsUrl}?error=capture_failed`);
    }
  } catch (e) {
    console.error("PayPal capture error:", e);
    await supabaseAdmin
      .from("paypal_orders")
      .update({ status: "failed" })
      .eq("order_id", orderId)
      .eq("status", "capturing");
    return NextResponse.redirect(`${creditsUrl}?error=capture_failed`);
  }

  const { data: updated, error: updateOrderErr } = await supabaseAdmin
    .from("paypal_orders")
    .update({
      status: "captured",
      captured_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("status", "capturing")
    .select("id")
    .maybeSingle();
  if (updateOrderErr || !updated) {
    console.error(
      "PayPal complete: failed to mark order captured",
      updateOrderErr,
    );
    return NextResponse.redirect(`${creditsUrl}?error=credits_failed`);
  }

  const ok = await addCredits(orderRow.user_id, Number(orderRow.credits ?? 0));
  if (!ok) {
    console.error(
      "PayPal: addCredits failed after capture. Manual recovery required.",
      {
        orderId: orderId,
        userId: orderRow.user_id,
        credits: orderRow.credits,
      },
    );
    return NextResponse.redirect(`${creditsUrl}?error=credits_failed`);
  }

  const periodEndsAt = new Date();
  periodEndsAt.setDate(periodEndsAt.getDate() + 30);
  await supabaseAdmin.from("user_subscriptions").upsert(
    {
      user_id: orderRow.user_id,
      plan_id: orderRow.plan_id,
      period_ends_at: periodEndsAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return NextResponse.redirect(`${creditsUrl}?success=1`);
}
