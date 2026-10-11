import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const INVITE_TTL_DAYS = 7;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, invitationId } = await params;

  // owner 전용
  const { data: ownerCheck } = await supabaseAdmin
    .from("brands")
    .select("id, name")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownerCheck)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 초대 조회 (만료 여부 무관, used_at이 null인 것만)
  const { data: invite } = await supabaseAdmin
    .from("brand_invitations")
    .select("id, invitee_email, token")
    .eq("id", invitationId)
    .eq("brand_id", brandId)
    .is("used_at", null)
    .maybeSingle();

  if (!invite)
    return NextResponse.json(
      { error: "초대를 찾을 수 없습니다." },
      { status: 404 },
    );

  // 새 토큰 + TTL 갱신
  const newToken =
    randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const newExpiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error: updateErr } = await supabaseAdmin
    .from("brand_invitations")
    .update({ token: newToken, expires_at: newExpiresAt.toISOString() })
    .eq("id", invitationId);

  if (updateErr)
    return NextResponse.json(
      { error: "재발송에 실패했습니다." },
      { status: 500 },
    );

  // inviter 이메일 조회
  let inviterEmail = "";
  try {
    const { data: inviterData } = await supabaseAdmin.auth.admin.getUserById(
      userId,
    );
    inviterEmail = inviterData?.user?.email ?? "";
  } catch {
    inviterEmail = "";
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const inviteUrl = `${appUrl}/invite/${newToken}`;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.INVITE_FROM_EMAIL?.trim() || "Zeriv <support@example.com>";

  if (!apiKey)
    return NextResponse.json(
      { error: "RESEND_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#09090b;color:#f4f4f5;padding:40px 20px;max-width:480px;margin:0 auto">
  <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">워크스페이스 초대 (재발송)</h2>
  <p style="color:#a1a1aa;font-size:14px;margin-bottom:24px">
    <strong style="color:#f4f4f5">${inviterEmail}</strong>님이
    <strong style="color:#f4f4f5">${ownerCheck.name ?? "워크스페이스"}</strong>에 다시 초대했습니다.
  </p>
  <a href="${inviteUrl}"
     style="display:inline-block;background:linear-gradient(135deg,#ffa4c6,#ffe3be);color:#000;font-weight:700;
            padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px">
    초대 수락하기
  </a>
  <p style="color:#52525b;font-size:12px;margin-top:24px">
    이 링크는 ${newExpiresAt.toLocaleDateString("ko-KR")}까지 유효합니다.<br/>
    본인이 요청하지 않은 경우 이 이메일을 무시하세요.
  </p>
</body>
</html>`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [invite.invitee_email],
      subject: "[Zeriv] 워크스페이스 초대 (재발송)",
      html,
    }),
  });

  if (!emailRes.ok) {
    const t = await emailRes.text();
    console.error("resend email failed:", emailRes.status, t);
    return NextResponse.json(
      { error: "이메일 발송에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, expiresAt: newExpiresAt.toISOString() });
}
