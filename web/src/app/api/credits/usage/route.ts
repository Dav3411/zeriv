import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/credits/usage
 * Returns credit balance, current plan, and recent transaction history.
 */
export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 });
  }

  // Balance
  const { data: wallet } = await supabaseAdmin
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  // Current subscription
  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("plan_id, period_ends_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Recent reservations (last 50)
  const { data: reservations } = await supabaseAdmin
    .from("credit_reservations")
    .select("id, render_job_id, amount, status, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Recent payments (last 20)
  const { data: payments } = await supabaseAdmin
    .from("paypal_subscription_payments")
    .select("plan_id, credits, amount_usd, paid_at")
    .eq("user_id", userId)
    .order("paid_at", { ascending: false })
    .limit(20);

  // One-time purchases
  const { data: orders } = await supabaseAdmin
    .from("paypal_orders")
    .select("plan_id, credits, amount_usd, status, captured_at")
    .eq("user_id", userId)
    .eq("status", "captured")
    .order("captured_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    balance: wallet?.balance ?? 0,
    subscription: sub ?? null,
    reservations: reservations ?? [],
    payments: payments ?? [],
    orders: orders ?? [],
  });
}
