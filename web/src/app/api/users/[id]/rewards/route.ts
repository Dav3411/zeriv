import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/users/[id]/rewards
 * 해당 유저의 리워드 요약. 본인(id와 일치하는 로그인 유저)만 조회 가능.
 * - rewardThisMonthUsd: 이번 달 실제 지급 리워드 합계
 * - rewardTotalUsd: 지금까지 받은 총 리워드
 * - rewardBalanceUsd: 출금 가능 잔액
 * - monthlyPayouts: 월별 실제 지급 합계
 * - monthlyWithdrawals: 월별 출금 요청/처리 통계
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authErr, userId: viewerId } = await requireUserId(req);
  if (authErr || !viewerId) {
    return NextResponse.json({ error: authErr ?? "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id !== viewerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const [{ data: payouts }, { data: wallet }, { data: pendingRow }, { data: withdrawalRows }] = await Promise.all([
    supabaseAdmin
      .from("reward_payouts")
      .select("month, amount_usd, applied_at")
      .eq("user_id", id),
    supabaseAdmin
      .from("user_wallets")
      .select("reward_balance_usd")
      .eq("user_id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("withdrawal_requests")
      .select("amount_usd, created_at")
      .eq("user_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("withdrawal_requests")
      .select("amount_usd, status, created_at, processed_at")
      .eq("user_id", id),
  ]);

  const rows = (payouts ?? []) as { month: string; amount_usd: number; applied_at: string | null }[];
  const paidRows = rows.filter((r) => !!r.applied_at);
  const rewardTotalUsd = paidRows.reduce((sum, r) => sum + Number(r.amount_usd ?? 0), 0);

  const rewardThisMonthUsd = paidRows
    .filter((r) => r.month === thisMonth)
    .reduce((sum, r) => sum + Number(r.amount_usd ?? 0), 0);

  const rewardBalanceUsd = Number(wallet?.reward_balance_usd ?? 0);

  const pendingWithdrawal =
    pendingRow != null
      ? {
          amountUsd: Math.round(Number(pendingRow.amount_usd ?? 0) * 100) / 100,
          createdAt: (pendingRow as { created_at?: string }).created_at ?? null,
        }
      : null;

  const monthlyPayoutMap = new Map<string, number>();
  for (const row of paidRows) {
    const monthKey = row.month;
    monthlyPayoutMap.set(monthKey, (monthlyPayoutMap.get(monthKey) ?? 0) + Number(row.amount_usd ?? 0));
  }
  const monthlyPayouts = Array.from(monthlyPayoutMap.entries())
    .map(([month, amountUsd]) => ({
      month,
      amountUsd: Math.round(amountUsd * 100) / 100,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  const monthlyWithdrawMap = new Map<
    string,
    { requestedUsd: number; completedUsd: number; pendingUsd: number; failedUsd: number; requestCount: number }
  >();
  for (const row of (withdrawalRows ?? []) as Array<{
    amount_usd?: number | null;
    status?: string | null;
    created_at?: string | null;
    processed_at?: string | null;
  }>) {
    const baseDate = row.processed_at ?? row.created_at;
    if (!baseDate) continue;
    const monthKey = new Date(baseDate).toISOString().slice(0, 7);
    const amount = Number(row.amount_usd ?? 0);
    const agg = monthlyWithdrawMap.get(monthKey) ?? {
      requestedUsd: 0,
      completedUsd: 0,
      pendingUsd: 0,
      failedUsd: 0,
      requestCount: 0,
    };
    agg.requestedUsd += amount;
    agg.requestCount += 1;
    if (row.status === "completed") agg.completedUsd += amount;
    else if (row.status === "pending") agg.pendingUsd += amount;
    else if (row.status === "failed" || row.status === "rejected") agg.failedUsd += amount;
    monthlyWithdrawMap.set(monthKey, agg);
  }
  const monthlyWithdrawals = Array.from(monthlyWithdrawMap.entries())
    .map(([month, agg]) => ({
      month,
      requestedUsd: Math.round(agg.requestedUsd * 100) / 100,
      completedUsd: Math.round(agg.completedUsd * 100) / 100,
      pendingUsd: Math.round(agg.pendingUsd * 100) / 100,
      failedUsd: Math.round(agg.failedUsd * 100) / 100,
      requestCount: agg.requestCount,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  return NextResponse.json({
    rewardThisMonthUsd: Math.round(rewardThisMonthUsd * 100) / 100,
    rewardTotalUsd: Math.round(rewardTotalUsd * 100) / 100,
    rewardBalanceUsd: Math.round(rewardBalanceUsd * 100) / 100,
    pendingWithdrawal,
    monthlyPayouts,
    monthlyWithdrawals,
  });
}
