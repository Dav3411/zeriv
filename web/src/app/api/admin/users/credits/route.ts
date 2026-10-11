export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: User 크레딧 수동 조정.
 *
 * POST body: { userId: string (UUID), delta: number (양수=지급/음수=차감, !=0), reason: string }
 *
 * 동시성: `add_credits_atomic` RPC가 단일 SQL 문에서 atomic +delta를 보장하므로
 * 동시 조정/소비와의 race는 없다 (음수 delta 허용).
 *
 * 잔액이 음수가 되는 것에 대한 별도 가드는 없음 — 크레딧 회수가 필요한 경우
 * 이를 명시적으로 허용해야 하므로 호출 측에서 reason과 함께 책임진다.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DELTA = 1_000_000;

export async function POST(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { userId?: unknown; delta?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as {
      userId?: unknown;
      delta?: unknown;
      reason?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const deltaRaw =
    typeof body.delta === "number"
      ? body.delta
      : typeof body.delta === "string"
        ? Number(body.delta)
        : NaN;

  if (!UUID_RE.test(userId)) {
    return NextResponse.json(
      { error: "userId must be a valid UUID" },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(deltaRaw) ||
    !Number.isInteger(deltaRaw) ||
    deltaRaw === 0
  ) {
    return NextResponse.json(
      { error: "delta must be a non-zero integer" },
      { status: 400 },
    );
  }
  if (Math.abs(deltaRaw) > MAX_DELTA) {
    return NextResponse.json(
      { error: `|delta| must be <= ${MAX_DELTA}` },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const delta = deltaRaw;

  // 1. atomic 조정
  const { error: rpcErr } = await supabaseAdmin.rpc("add_credits_atomic", {
    p_user_id: userId,
    p_amount: delta,
  });
  if (rpcErr) {
    return NextResponse.json(
      { error: rpcErr.message ?? "Failed to adjust credits" },
      { status: 500 },
    );
  }

  // 2. 새 잔액 조회 (best-effort — 표시용)
  const { data: walletRow } = await supabaseAdmin
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const newBalance =
    (walletRow as { balance?: number } | null)?.balance ?? null;

  // 3. 감사 로그 (best-effort)
  await logAdminAction({
    adminUserId: auth.userId,
    action: "credits_adjust",
    targetType: "user",
    targetId: userId,
    details: { delta, reason, newBalance },
  });

  return NextResponse.json({
    ok: true,
    userId,
    delta,
    newBalance,
    reason,
  });
}
