import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgModelCount,
} from "@/lib/organizationSubscription";

export const runtime = "nodejs";

/** POST /api/brands/[id]/models
 * body: { influencerId: string }
 * models.brand_id를 설정해 브랜드 모델 탭에서 조회되도록 연결
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );

  const { id: brandId } = await params;

  // 브랜드 소유 확인
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  let body: { influencerId?: string };
  try {
    body = (await req.json()) as { influencerId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const influencerId = body.influencerId?.trim();
  if (!influencerId)
    return NextResponse.json(
      { error: "influencerId is required" },
      { status: 400 },
    );

  // 플랜 한도 확인 (organization 풀 기준)
  const brandSub = await getBrandSubscription(brandId);
  const modelLimit = brandSub?.plan.modelLimit ?? null;

  // modelLimit === 0: 해당 플랜은 AI 모델 자체가 미포함 (Quick Plus 등) — 즉시 차단.
  if (modelLimit === 0) {
    return NextResponse.json(
      {
        error:
          "AI 모델 생성은 Atelier 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요.",
        limit: 0,
        current: 0,
      },
      { status: 403 },
    );
  }

  if (modelLimit !== null) {
    const orgId = await getOrgIdFromBrand(brandId);
    let current: number;
    if (orgId) {
      current = await getOrgModelCount(orgId);
    } else {
      const { count: modelCount, error: countErr } = await supabaseAdmin
        .from("models")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId);
      if (countErr)
        return NextResponse.json(
          { error: "Failed to count models" },
          { status: 500 },
        );
      current = modelCount ?? 0;
    }

    if (current >= modelLimit)
      return NextResponse.json(
        { error: "모델 추가 한도 초과", limit: modelLimit, current },
        { status: 403 },
      );
  }

  // 모델 소유 확인 및 brand_id 업데이트
  const { error: updateErr } = await supabaseAdmin
    .from("models")
    .update({ brand_id: brandId })
    .eq("id", influencerId)
    .eq("user_id", userId);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
