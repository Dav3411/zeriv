import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDefaultOrgIdForUser } from "@/lib/organizationSubscription";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ saved: false });
  }

  const { templateId } = await params;

  // brandId 결정: URL query → org default → legacy user_id fallback
  const urlBrandId = new URL(req.url).searchParams.get("brandId");
  let brandId: string | null = urlBrandId;

  if (!brandId) {
    const defaultOrgId = await getDefaultOrgIdForUser(userId);
    if (defaultOrgId) {
      const { data: orgBrands } = await supabaseAdmin
        .from("brands")
        .select("id")
        .eq("organization_id", defaultOrgId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (orgBrands && orgBrands.length > 0)
        brandId = orgBrands[0].id as string;
    }
  }

  if (!brandId) {
    const { data: brands } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (brands && brands.length > 0) brandId = brands[0].id as string;
  }

  if (!brandId) {
    return NextResponse.json({ saved: false });
  }

  // brand_style_saves에서 저장 여부 확인
  // junction table 타입이 자동생성되지 않은 경우 대비해 캐스팅.
  const { data: save } = await (
    supabaseAdmin.from("brand_style_saves") as unknown as {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{ data: { style_id: string } | null }>;
          };
        };
      };
    }
  )
    .select("style_id")
    .eq("brand_id", brandId)
    .eq("style_id", templateId)
    .maybeSingle();

  if (save) {
    return NextResponse.json({ saved: true, styleId: templateId, brandId });
  }
  return NextResponse.json({ saved: false });
}
