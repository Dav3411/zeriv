import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  dbGetProduct,
  dbUpdateProduct,
  dbArchiveProduct,
} from "@/lib/brandProduct/brandProduct.repository";
import type { BrandProductRow } from "@/lib/brandProduct/brandProduct.types";
import { resolveProductUrls } from "@/lib/brandProduct/productUrlResolver";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

type PatchBody = {
  name?: string;
  description?: string;
  status?: BrandProductRow["status"];
  productCategory?: BrandProductRow["product_category"];
  packagingType?: BrandProductRow["packaging_type"];
  packagingFinish?: BrandProductRow["packaging_finish"];
  packagingMaterial?: BrandProductRow["packaging_material"];
  dominantColors?: string[];
  isTransparent?: boolean;
  visualKeywords?: string[];
  avoidKeywords?: string[];
  heroFeature?: string;
  preferredScale?: BrandProductRow["preferred_scale"];
  preferredBgTreatment?: BrandProductRow["preferred_bg_treatment"];
  defaultInsertionMode?: BrandProductRow["default_insertion_mode"];
};

// GET /api/brands/[id]/products/[productId]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, productId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const product = await dbGetProduct(productId, brandId);
  if (!product)
    return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // 서명된 URL 만료 방지: 조회 시마다 images URL 갱신
  return NextResponse.json({ product: await resolveProductUrls(product) });
}

// PATCH /api/brands/[id]/products/[productId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, productId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const existing = await dbGetProduct(productId, brandId);
  if (!existing)
    return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = (await req.json()) as PatchBody;

  const patch: Partial<
    Omit<
      BrandProductRow,
      "id" | "brand_id" | "user_id" | "created_at" | "updated_at"
    >
  > = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.status !== undefined) patch.status = body.status;
  if (body.productCategory !== undefined)
    patch.product_category = body.productCategory;
  if (body.packagingType !== undefined)
    patch.packaging_type = body.packagingType;
  if (body.packagingFinish !== undefined)
    patch.packaging_finish = body.packagingFinish;
  if (body.packagingMaterial !== undefined)
    patch.packaging_material = body.packagingMaterial;
  if (body.dominantColors !== undefined)
    patch.dominant_colors = body.dominantColors;
  if (body.isTransparent !== undefined)
    patch.is_transparent = body.isTransparent;
  if (body.visualKeywords !== undefined)
    patch.visual_keywords = body.visualKeywords;
  if (body.avoidKeywords !== undefined)
    patch.avoid_keywords = body.avoidKeywords;
  if (body.heroFeature !== undefined) patch.hero_feature = body.heroFeature;
  if (body.preferredScale !== undefined)
    patch.preferred_scale = body.preferredScale;
  if (body.preferredBgTreatment !== undefined)
    patch.preferred_bg_treatment = body.preferredBgTreatment;
  if (body.defaultInsertionMode !== undefined)
    patch.default_insertion_mode = body.defaultInsertionMode;

  const product = await dbUpdateProduct(productId, brandId, patch);
  return NextResponse.json({ product: await resolveProductUrls(product) });
}

// DELETE /api/brands/[id]/products/[productId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, productId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const existing = await dbGetProduct(productId, brandId);
  if (!existing)
    return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await dbArchiveProduct(productId, brandId);
  return NextResponse.json({ ok: true });
}
