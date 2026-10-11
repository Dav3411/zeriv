import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { getOrgIdFromBrand } from "@/lib/organizationSubscription";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<NextResponse> {
  const { userId: requestUserId, error } = await requireUserId(req);
  if (error || !requestUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: brandId, userId: targetUserId } = await params;

  const brand = await dbGetBrand(brandId, requestUserId);
  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 멤버 제거는 owner 전용
  const { data: ownerCheck } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", requestUserId)
    .maybeSingle();
  if (!ownerCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 오너 자신은 제거 불가
  if (targetUserId === requestUserId) {
    return NextResponse.json(
      { error: "오너는 본인을 제거할 수 없습니다." },
      { status: 400 },
    );
  }

  const orgId = await getOrgIdFromBrand(brandId);
  if (!orgId) {
    return NextResponse.json(
      { error: "Organization not found for this brand" },
      { status: 500 },
    );
  }

  // 대상 user가 organization owner면 제거 거부
  const { data: targetMembership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (targetMembership?.role === 'owner') {
    return NextResponse.json(
      { error: "조직 오너는 멤버에서 제거할 수 없습니다." },
      { status: 400 },
    );
  }

  const { error: deleteErr } = await supabaseAdmin
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", targetUserId);

  if (deleteErr) {
    return NextResponse.json(
      { error: "멤버 제거에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
