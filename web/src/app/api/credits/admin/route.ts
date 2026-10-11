import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";

export const runtime = "nodejs";

type Body = {
  userId?: string;
  amount?: number;
  mode?: "delta" | "set";
  reason?: string;
};

/**
 * 입력 검증 상수.
 * - UUID_RE: RFC 4122 형식 강제 (admin 토큰 탈취 시 임의 문자열로 wallet 행을 만드는 것을 차단).
 * - MAX_AMOUNT: 단일 호출당 절대값 상한. delta/set 양쪽 모두 적용.
 *   동일 도메인의 web/src/app/api/admin/users/credits/route.ts(MAX_DELTA=1_000_000)와 정렬.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000;

/** 관리자: 유저별 크레딧 잔액 목록 (닉네임 포함). 로그인 + ADMIN_USER_IDS allowlist 필요 */
export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: wallets, error: walletsErr } = await supabaseAdmin
    .from("credit_wallets")
    .select("user_id, balance, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (walletsErr) {
    return NextResponse.json(
      { error: "Failed to load wallets" },
      { status: 500 },
    );
  }

  const userIds = (wallets ?? []).map((w) => w.user_id);
  const nicknames: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      nicknames[p.user_id] = p.nickname ?? "";
    }
  }

  const list = (wallets ?? []).map((w) => ({
    userId: w.user_id,
    balance: w.balance,
    nickname: nicknames[w.user_id] ?? null,
    updatedAt: w.updated_at,
  }));

  return NextResponse.json({ wallets: list });
}

export async function POST(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json(
      { error: "userId must be a valid UUID" },
      { status: 400 },
    );
  }

  const mode = body.mode ?? "delta";
  if (mode !== "delta" && mode !== "set") {
    return NextResponse.json(
      { error: 'mode must be "delta" or "set"' },
      { status: 400 },
    );
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return NextResponse.json(
      { error: "amount must be an integer" },
      { status: 400 },
    );
  }
  if (mode === "delta" && amount === 0) {
    return NextResponse.json(
      { error: "amount must be non-zero" },
      { status: 400 },
    );
  }
  if (Math.abs(amount) > MAX_AMOUNT) {
    return NextResponse.json(
      { error: `|amount| must be <= ${MAX_AMOUNT}` },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim()
      : "unspecified";

  const { error: insertErr } = await supabaseAdmin
    .from("credit_wallets")
    .insert({
      user_id: userId,
      balance: 0,
      updated_at: new Date().toISOString(),
    });
  if (insertErr && insertErr.code !== "23505") {
    return NextResponse.json(
      { error: "Failed to ensure wallet" },
      { status: 500 },
    );
  }

  const { data: wallet, error: readErr } = await supabaseAdmin
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: "Failed to load wallet" },
      { status: 500 },
    );
  }

  const previousBalance = Number(wallet?.balance ?? 0);
  const next = mode === "set" ? amount : previousBalance + amount;
  if (next < 0) {
    return NextResponse.json(
      { error: "Balance cannot be negative" },
      { status: 400 },
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from("credit_wallets")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to update wallet" },
      { status: 500 },
    );
  }

  // 감사 로그 (best-effort — 실패해도 throw 안 함). previousBalance/newBalance 모두 기록하여
  // mode="set"으로 임의 덮어쓴 흔적을 추적 가능하게 한다.
  await logAdminAction({
    adminUserId: auth.userId,
    action: "credits_adjust",
    targetType: "user",
    targetId: userId,
    details: {
      mode,
      amount,
      previousBalance,
      newBalance: next,
      reason,
    },
  });

  return NextResponse.json({ userId, balance: next });
}

/** 관리자: 유저 크레딧 지갑 삭제 (해당 유저 행 제거, 목록에서 사라짐) */
export async function DELETE(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { userId?: string; reason?: string };
  try {
    body = (await req.json()) as { userId?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json(
      { error: "userId must be a valid UUID" },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim()
      : "unspecified";

  // 삭제 전 잔액 조회 — delete 후에는 조회 불가하므로 audit details에 기록
  const { data: wallet } = await supabaseAdmin
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const previousBalance = Number(wallet?.balance ?? 0);

  const { error } = await supabaseAdmin
    .from("credit_wallets")
    .delete()
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete wallet" },
      { status: 500 },
    );
  }

  // 감사 로그 (best-effort — 실패해도 throw 안 함)
  await logAdminAction({
    adminUserId: auth.userId,
    action: "credits_delete",
    targetType: "user",
    targetId: userId,
    details: { previousBalance, reason },
  });

  return NextResponse.json({ ok: true, userId });
}
