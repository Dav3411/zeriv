import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: brandId, invitationId } = await params;

  // owner 전용
  const { data: ownerCheck } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownerCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 해당 초대가 이 브랜드 소속인지 확인 후 삭제
  const { error: deleteErr } = await supabaseAdmin
    .from("brand_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("brand_id", brandId)
    .is("used_at", null); // 이미 수락된 초대는 취소 불가

  if (deleteErr) {
    return NextResponse.json(
      { error: "초대 취소에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
