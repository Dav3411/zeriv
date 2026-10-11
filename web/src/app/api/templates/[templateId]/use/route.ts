import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDefaultOrgIdForUser } from "@/lib/organizationSubscription";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId } = await params;

  // 템플릿 존재 확인 (id만 필요 — 더 이상 전체 필드 복사 안 함)
  const { data: template, error: templateErr } = await supabaseAdmin
    .from("styles")
    .select("id")
    .eq("id", templateId)
    .eq("is_template", true)
    .single();

  if (templateErr || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // brandId 결정
  let body: { brandId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body 없어도 허용
  }

  let targetBrandId = body.brandId;

  if (targetBrandId) {
    // 사용자 소유 또는 organization 멤버십 검증
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, user_id, organization_id")
      .eq("id", targetBrandId)
      .maybeSingle();

    if (!brand) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let hasAccess = brand.user_id === userId;
    if (!hasAccess && brand.organization_id) {
      const { data: membership } = await supabaseAdmin
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", brand.organization_id)
        .eq("user_id", userId)
        .in("role", ["owner", "admin", "member"])
        .maybeSingle();
      hasAccess = !!membership;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!targetBrandId) {
    // 1차: default organization 기반 fallback
    const defaultOrgId = await getDefaultOrgIdForUser(userId);
    if (defaultOrgId) {
      const { data: orgBrands } = await supabaseAdmin
        .from("brands")
        .select("id")
        .eq("organization_id", defaultOrgId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (orgBrands && orgBrands.length > 0) {
        targetBrandId = orgBrands[0].id as string;
      }
    }

    // 2차: legacy fallback (user_id 기반)
    if (!targetBrandId) {
      const { data: brands } = await supabaseAdmin
        .from("brands")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (brands && brands.length > 0) {
        targetBrandId = brands[0].id as string;
      }
    }

    if (!targetBrandId) {
      return NextResponse.json({ error: "no_brands" }, { status: 404 });
    }
  }

  // brand_style_saves에 upsert (멱등 — 이미 있으면 무시)
  // junction table 타입이 아직 자동생성되지 않았을 수 있어 캐스팅으로 처리.
  const { error: saveErr } = await (
    supabaseAdmin.from("brand_style_saves") as unknown as {
      upsert: (
        row: { brand_id: string; style_id: string },
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).upsert(
    { brand_id: targetBrandId, style_id: templateId },
    { onConflict: "brand_id,style_id" },
  );

  if (saveErr) {
    console.error("[POST /api/templates/use] save failed:", saveErr.message);
    return NextResponse.json(
      { error: "Failed to save template" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    brandId: targetBrandId,
    styleId: templateId,
  });
}
