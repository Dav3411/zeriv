import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: 유저 계정 삭제 (Supabase Auth + 연관 데이터 cascade).
 * 로그인 + ADMIN_USER_IDS allowlist 필요.
 */
export async function POST(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { userId?: string };
  try {
    body = (await req.json()) as { userId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json(
      { error: "userId must be a valid UUID" },
      { status: 400 },
    );
  }

  // 삭제 직전 이메일 스냅샷 (감사 로그용 — 삭제 후에는 조회 불가).
  // best-effort: 조회 실패해도 삭제는 진행한다.
  let deletedEmail: string | null = null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    deletedEmail = data?.user?.email ?? null;
  } catch {
    // ignore — 감사 로그 디테일이 없어도 본 액션은 진행
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 },
    );
  }

  await logAdminAction({
    adminUserId: auth.userId,
    action: "account_delete",
    targetType: "user",
    targetId: userId,
    details: { email: deletedEmail },
  });

  return NextResponse.json({ ok: true, userId });
}
