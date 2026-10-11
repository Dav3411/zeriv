import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  dbGetBrandProfile,
  dbUpdateBrandProfile,
} from "@/lib/style/style.repository";
import type { BrandProfileFields } from "@/lib/style/style.types";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { isHttpUrl } from "@/lib/style/styleUrlResolver";
import { getR2PublicUrl } from "@/lib/r2";

/**
 * 브랜드 프로필 응답 직전 reference_images의 R2 key → public URL 변환.
 *
 * reference_images는 신규 데이터에서 R2 key, 레거시에서는 https URL이 혼재한다.
 * styleUrlResolver와 동일한 정책:
 *   - http(s) URL은 그대로 통과
 *   - key는 r2KeyToPublicUrl로 변환
 *   - R2_PUBLIC_URL 미설정 개발 환경에서는 throw 대신 원본 유지 (전체 500 회피)
 */
async function resolveProfileImages<
  T extends Pick<BrandProfileFields, "reference_images">,
>(profile: T): Promise<T> {
  const refs = profile.reference_images ?? [];
  const resolved = await Promise.all(
    refs.map(async (v) => {
      if (!v) return v;
      if (isHttpUrl(v)) return v;
      try {
        return await getR2PublicUrl(v);
      } catch {
        return v;
      }
    }),
  );
  return { ...profile, reference_images: resolved };
}

// GET /api/brands/[id]/profile — 브랜드 프로필 필드 조회
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const profile = await dbGetBrandProfile(brandId);
  if (!profile) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json({ profile: await resolveProfileImages(profile) });
}

// PATCH /api/brands/[id]/profile — 브랜드 프로필 필드 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 모두 브랜드 설정 수정 가능
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const body = (await req.json()) as Partial<BrandProfileFields>;

  // 허용 필드만 추출
  const patch: Partial<BrandProfileFields> = {};
  if (body.description !== undefined) patch.description = body.description;
  if (body.keywords !== undefined) patch.keywords = body.keywords;
  if (body.prohibited_rules !== undefined)
    patch.prohibited_rules = body.prohibited_rules;
  if (body.reference_images !== undefined)
    patch.reference_images = body.reference_images;
  if (body.color_palette !== undefined)
    patch.color_palette = body.color_palette;
  if (body.mood_summary !== undefined) patch.mood_summary = body.mood_summary;
  if (body.active_style_id !== undefined)
    patch.active_style_id = body.active_style_id;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  await dbUpdateBrandProfile(brandId, patch);
  const updated = await dbGetBrandProfile(brandId);
  return NextResponse.json({
    profile: updated ? await resolveProfileImages(updated) : null,
  });
}
