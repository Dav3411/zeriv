import { NextResponse } from "next/server";
import { capturePayPalOrder } from "@/lib/paypal";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ONE_TIME_PLAN_ID = "one_time_5000";

async function addCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return false;
  const { error } = await supabaseAdmin.rpc("add_credits_atomic", {
    p_user_id: userId,
    p_amount: amount,
  });
  return !error;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const rawBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  const baseUrl = rawBase.startsWith("http") ? rawBase : `https://${rawBase}`;
  const oneTimeUrl = `${baseUrl.replace(/\/$/, "")}/pricing`;

  if (!token) {
    return NextResponse.redirect(`${oneTimeUrl}?error=missing_token`);
  }

  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("paypal_orders")
    .select("id, user_id, plan_id, credits, status")
    .eq("order_id", token)
    .maybeSingle();

  if (orderErr || !orderRow) {
    return NextResponse.redirect(`${oneTimeUrl}?error=order_not_found`);
  }
  if (orderRow.plan_id !== ONE_TIME_PLAN_ID) {
    return NextResponse.redirect(`${oneTimeUrl}?error=invalid_order_type`);
  }
  if (orderRow.status === "captured") {
    return NextResponse.redirect(`${oneTimeUrl}?success=1`);
  }
  if (orderRow.status === "capturing") {
    return NextResponse.redirect(`${oneTimeUrl}?error=processing`);
  }

  // pending → capturing 전이로 DB 레벨 락 획득. 한 번에 한 요청만 통과한다.
  const { data: lockRow, error: lockErr } = await supabaseAdmin
    .from("paypal_orders")
    .update({ status: "capturing" })
    .eq("order_id", token)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (lockErr) {
    console.error("PayPal one-time complete: lock acquire error", lockErr);
    return NextResponse.redirect(`${oneTimeUrl}?error=capture_failed`);
  }
  if (!lockRow) {
    const { data: latest } = await supabaseAdmin
      .from("paypal_orders")
      .select("status")
      .eq("order_id", token)
      .maybeSingle();
    if (latest?.status === "captured") {
      return NextResponse.redirect(`${oneTimeUrl}?success=1`);
    }
    if (latest?.status === "capturing") {
      return NextResponse.redirect(`${oneTimeUrl}?error=processing`);
    }
    if (latest?.status === "failed") {
      return NextResponse.redirect(`${oneTimeUrl}?error=capture_failed`);
    }
    return NextResponse.redirect(`${oneTimeUrl}?error=capture_failed`);
  }

  try {
    const { status } = await capturePayPalOrder(token);
    if (status !== "COMPLETED") {
      await supabaseAdmin
        .from("paypal_orders")
        .update({ status: "failed" })
        .eq("order_id", token)
        .eq("status", "capturing");
      return NextResponse.redirect(`${oneTimeUrl}?error=capture_failed`);
    }
  } catch (e) {
    console.error("PayPal one-time capture error:", e);
    await supabaseAdmin
      .from("paypal_orders")
      .update({ status: "failed" })
      .eq("order_id", token)
      .eq("status", "capturing");
    return NextResponse.redirect(`${oneTimeUrl}?error=capture_failed`);
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("paypal_orders")
    .update({
      status: "captured",
      captured_at: new Date().toISOString(),
    })
    .eq("order_id", token)
    .eq("status", "capturing")
    .select("id")
    .maybeSingle();
  if (updateErr || !updated) {
    console.error(
      "PayPal one-time complete: failed to mark captured",
      updateErr,
    );
    return NextResponse.redirect(`${oneTimeUrl}?error=credits_failed`);
  }

  const ok = await addCredits(orderRow.user_id, Number(orderRow.credits ?? 0));
  if (!ok) {
    console.error(
      "PayPal: addCredits failed after capture. Manual recovery required.",
      {
        orderId: token,
        userId: orderRow.user_id,
        credits: orderRow.credits,
      },
    );
    return NextResponse.redirect(`${oneTimeUrl}?error=credits_failed`);
  }

  return NextResponse.redirect(`${oneTimeUrl}?success=1`);
}
