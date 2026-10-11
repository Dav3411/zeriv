import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrgIdFromBrand } from "@/lib/organizationSubscription";

export const runtime = "nodejs";

interface InvitationRecord {
  id: string;
  brand_id: string;
  invitee_email: string;
  expires_at: string;
  used_at: string | null;
}

/**
 * 토큰으로 초대 레코드를 조회하고 상태를 검증한다.
 * 반환: { invitation, errorResponse } — errorResponse가 있으면 즉시 반환해야 한다.
 */
async function loadAndValidateInvitation(
  token: string,
): Promise<
  | { invitation: InvitationRecord; errorResponse: null }
  | { invitation: null; errorResponse: NextResponse }
> {
  const { data, error } = await supabaseAdmin
    .from("brand_invitations")
    .select("id, brand_id, invitee_email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return {
      invitation: null,
      errorResponse: NextResponse.json(
        { error: "유효하지 않은 초대 링크입니다." },
        { status: 404 },
      ),
    };
  }

  const invitation = data as InvitationRecord;

  if (invitation.used_at) {
    return {
      invitation: null,
      errorResponse: NextResponse.json(
        { error: "이미 사용된 초대 링크입니다." },
        { status: 410 },
      ),
    };
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return {
      invitation: null,
      errorResponse: NextResponse.json(
        { error: "만료된 초대 링크입니다." },
        { status: 410 },
      ),
    };
  }

  return { invitation, errorResponse: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!token) {
    return NextResponse.json(
      { error: "유효하지 않은 초대 링크입니다." },
      { status: 404 },
    );
  }

  const { invitation, errorResponse } = await loadAndValidateInvitation(token);
  if (errorResponse) return errorResponse;

  const { data: brandRow } = await supabaseAdmin
    .from("brands")
    .select("name")
    .eq("id", invitation.brand_id)
    .maybeSingle();

  const brandName = (brandRow?.name as string | undefined) ?? "워크스페이스";

  return NextResponse.json({
    ok: true,
    brandId: invitation.brand_id,
    brandName,
    inviteeEmail: invitation.invitee_email,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  if (!token) {
    return NextResponse.json(
      { error: "유효하지 않은 초대 링크입니다." },
      { status: 404 },
    );
  }

  const { invitation, errorResponse } = await loadAndValidateInvitation(token);
  if (errorResponse) return errorResponse;

  // 로그인 유저의 이메일과 초대 대상 이메일 일치 확인
  let currentEmail = "";
  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      userId,
    );
    currentEmail = (userData?.user?.email ?? "").toLowerCase();
  } catch {
    currentEmail = "";
  }

  if (!currentEmail || currentEmail !== invitation.invitee_email.toLowerCase()) {
    return NextResponse.json(
      { error: "초대받은 이메일 주소로 로그인해 주세요." },
      { status: 403 },
    );
  }

  // brand → organization 매핑
  const orgId = await getOrgIdFromBrand(invitation.brand_id);
  if (!orgId) {
    return NextResponse.json(
      { error: "Organization not found for this invitation" },
      { status: 500 },
    );
  }

  // 이미 organization 멤버인지 확인 (멱등성)
  const { data: existingMember } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingMember) {
    const { error: insertErr } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: orgId,
        user_id: userId,
        role: "member",
      });
    if (insertErr) {
      return NextResponse.json(
        { error: "멤버 추가에 실패했습니다." },
        { status: 500 },
      );
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from("brand_invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateErr) {
    // 멤버는 이미 추가됐으므로 실패는 로그만 남기고 정상 응답
    console.error(
      "brand_invitations used_at update failed:",
      updateErr.message,
    );
  }

  return NextResponse.json({ ok: true, brandId: invitation.brand_id });
}
