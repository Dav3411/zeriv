/**
 * POST /api/brands/[id]/test-product
 *
 * 온보딩 "건너뛰기" 플로우 전용 엔드포인트.
 * 해당 브랜드에 name='테스트 제품' 인 제품이 이미 있으면 그대로 반환하고,
 * 없으면 "공통 템플릿 테스트 제품"을 전역 검색해서 현재 브랜드로 복사한다.
 * 템플릿도 없으면 기본 더미 제품을 생성한다.
 *
 * 이미지는 원본 R2 key를 그대로 참조 복사한다(재업로드 없음).
 * 템플릿 이미지는 "공통 샘플" 성격이므로 브랜드 간 공유해도 문제없다는 전제를
 * 둔다. 나중에 브랜드별 격리가 필요하면 이 복사 단계를 업로드로 교체하면 된다.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  dbCreateProduct,
  dbListProducts,
} from "@/lib/brandProduct/brandProduct.repository";
import type {
  BrandProductRow,
  CreateBrandProductInput,
  ProductImage,
} from "@/lib/brandProduct/brandProduct.types";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";

export const runtime = "nodejs";

const TEST_PRODUCT_NAME = "테스트 제품";

/** 템플릿 이미지 배열의 signed URL 을 최신화해서 반환 */
async function refreshImageUrls(
  images: ProductImage[] | null | undefined,
): Promise<ProductImage[]> {
  if (!Array.isArray(images) || images.length === 0) return [];
  return Promise.all(
    images.map(async (img) => ({
      ...img,
      url: img.r2_key ? await getR2PublicUrl(img.r2_key) : img.url,
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, error: authError } = await requireUserId(req);
  if (authError || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // 접근 권한 확인 (owner + member)
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // 1. 이미 이 브랜드에 테스트 제품이 있는지 확인
  try {
    const existingList = await dbListProducts(brandId, "active");
    const existing = existingList.find((p) => p.name === TEST_PRODUCT_NAME);
    if (existing) {
      const refreshedImages = await refreshImageUrls(existing.images);
      const image_url = existing.image_r2_key
        ? await getR2PublicUrl(existing.image_r2_key)
        : existing.image_url;
      return NextResponse.json(
        {
          product: { ...existing, images: refreshedImages, image_url },
          reused: true,
        },
        { status: 200 },
      );
    }
  } catch (e) {
    console.error("[test-product] failed to check existing products:", e);
    // fallthrough — 새로 만들어 본다
  }

  // 2. 전역 템플릿 제품 조회 — 환경변수 ID 우선, 없으면 이름으로 fallback
  const commonTestProductId = process.env.COMMON_TEST_PRODUCT_ID;
  let template: BrandProductRow | null = null;
  try {
    if (commonTestProductId) {
      // 환경변수 ID로 직접 조회
      const { data, error } = await supabaseAdmin
        .from("products")
        .select(
          "id, name, description, product_category, packaging_type, packaging_finish, packaging_material, dominant_colors, is_transparent, visual_keywords, avoid_keywords, hero_feature, preferred_scale, preferred_bg_treatment, default_insertion_mode, product_meta, images, image_r2_key, image_url, has_transparent_bg, product_sheet_key, brand_id, status",
        )
        .eq("id", commonTestProductId)
        .eq("status", "active")
        .single();
      if (!error && data && data.brand_id !== brandId) {
        template = data as BrandProductRow;
      }
    }

    if (!template) {
      // fallback: 이름으로 검색
      const { data, error } = await supabaseAdmin
        .from("products")
        .select(
          "id, name, description, product_category, packaging_type, packaging_finish, packaging_material, dominant_colors, is_transparent, visual_keywords, avoid_keywords, hero_feature, preferred_scale, preferred_bg_treatment, default_insertion_mode, product_meta, images, image_r2_key, image_url, has_transparent_bg, product_sheet_key, brand_id, status",
        )
        .eq("name", TEST_PRODUCT_NAME)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(20);
      if (!error && Array.isArray(data) && data.length > 0) {
        const candidates = (data as BrandProductRow[]).filter(
          (row) => row.brand_id !== brandId,
        );
        template =
          candidates.find(
            (row) => Array.isArray(row.images) && row.images.length > 0,
          ) ??
          candidates[0] ??
          null;
      }
    }
  } catch (e) {
    console.error("[test-product] template query threw:", e);
  }

  // 3. 템플릿 데이터로 신규 제품 생성 — 없으면 기본 더미
  const createInput: Omit<CreateBrandProductInput, "brandId"> = template
    ? {
        name: TEST_PRODUCT_NAME,
        description: template.description ?? undefined,
        productCategory: template.product_category,
        packagingType: template.packaging_type ?? "bottle",
        packagingFinish: template.packaging_finish ?? "glossy",
        packagingMaterial: template.packaging_material ?? "plastic",
        dominantColors: template.dominant_colors ?? [],
        isTransparent: template.is_transparent ?? false,
        visualKeywords: template.visual_keywords ?? [],
        avoidKeywords: template.avoid_keywords ?? [],
        heroFeature: template.hero_feature ?? undefined,
        preferredScale: template.preferred_scale,
        preferredBgTreatment: template.preferred_bg_treatment,
        defaultInsertionMode: template.default_insertion_mode,
        productMeta: template.product_meta ?? {},
      }
    : {
        name: TEST_PRODUCT_NAME,
        productCategory: "skincare",
        packagingType: "bottle",
        packagingFinish: "glossy",
        packagingMaterial: "plastic",
      };

  let created: BrandProductRow;
  try {
    created = await dbCreateProduct({ ...createInput, brandId }, userId);
  } catch (e) {
    console.error("[test-product] create failed:", e);
    return NextResponse.json(
      { error: "테스트 제품 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  // 4. 템플릿이 있으면 이미지 메타(images 배열 + legacy image_*)를 그대로 복제.
  //    R2 key를 재사용하므로 재업로드는 없고, 단순 DB 업데이트로 끝난다.
  let usedTemplate = !!template;
  if (template) {
    const sourceImages = Array.isArray(template.images) ? template.images : [];
    const clonedImages: ProductImage[] = sourceImages.map((img, idx) => ({
      role: img.role,
      r2_key: img.r2_key,
      url: img.url,
      width: img.width,
      height: img.height,
      has_transparent_bg: img.has_transparent_bg ?? false,
      order_idx: idx,
    }));

    const hero =
      clonedImages.find((img) => img.role === "hero") ?? clonedImages[0];

    const patch: Record<string, unknown> = {
      images: clonedImages,
    };
    if (hero) {
      patch.image_r2_key = hero.r2_key;
      patch.image_url = hero.url;
      patch.has_transparent_bg = hero.has_transparent_bg ?? false;
    }
    if (template.product_sheet_key) {
      patch.product_sheet_key = template.product_sheet_key;
    }

    try {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("products")
        .update(patch)
        .eq("id", created.id)
        .eq("brand_id", brandId)
        .select()
        .single();
      if (updateError) {
        console.error(
          "[test-product] image metadata copy failed:",
          updateError,
        );
        usedTemplate = false;
      } else if (updated) {
        created = updated as BrandProductRow;
      }
    } catch (e) {
      console.error("[test-product] image metadata copy threw:", e);
      usedTemplate = false;
    }
  }

  // 5. 응답 — 이미지 URL 최신화
  const refreshedImages = await refreshImageUrls(created.images);
  const image_url = created.image_r2_key
    ? await getR2PublicUrl(created.image_r2_key)
    : created.image_url;

  return NextResponse.json(
    {
      product: { ...created, images: refreshedImages, image_url },
      reused: false,
      fromTemplate: usedTemplate,
    },
    { status: 201 },
  );
}
