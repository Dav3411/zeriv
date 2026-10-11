import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  BrandProductRow,
  CreateBrandProductInput,
  AddProductImageInput,
  ProductImage,
} from "./brandProduct.types";

// ─── 제품 CRUD ────────────────────────────────────────────────────────────────
// 권한은 상위 레이어에서 dbGetBrand(brandId, userId)로 먼저 검증한다.
// 아래 함수들은 brand_id 범위만 강제한다. user_id는 creator 추적 용도로만 유지.

export async function dbCreateProduct(
  input: CreateBrandProductInput,
  userId: string,
): Promise<BrandProductRow> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .insert({
      brand_id: input.brandId,
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      product_category: input.productCategory,
      packaging_type: input.packagingType,
      packaging_finish: input.packagingFinish,
      packaging_material: input.packagingMaterial,
      dominant_colors: input.dominantColors ?? [],
      is_transparent: input.isTransparent ?? false,
      visual_keywords: input.visualKeywords ?? [],
      avoid_keywords: input.avoidKeywords ?? [],
      hero_feature: input.heroFeature ?? null,
      preferred_scale: input.preferredScale ?? "large",
      preferred_bg_treatment: input.preferredBgTreatment ?? "contextual",
      default_insertion_mode: input.defaultInsertionMode ?? "graphic_insert",
      product_meta: input.productMeta ?? {},
    })
    .select()
    .single();
  if (error || !data)
    throw new Error(`Failed to create product: ${error?.message}`);
  return data as BrandProductRow;
}

export async function dbGetProduct(
  productId: string,
  brandId: string,
): Promise<BrandProductRow | null> {
  const { data } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("brand_id", brandId)
    .single();
  return (data as BrandProductRow | null) ?? null;
}

export async function dbListProducts(
  brandId: string,
  status: "active" | "archived" = "active",
): Promise<BrandProductRow[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list products: ${error.message}`);
  return (data ?? []) as BrandProductRow[];
}

export async function dbUpdateProduct(
  productId: string,
  brandId: string,
  patch: Partial<
    Omit<
      BrandProductRow,
      "id" | "brand_id" | "user_id" | "created_at" | "updated_at"
    >
  >,
): Promise<BrandProductRow> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(patch)
    .eq("id", productId)
    .eq("brand_id", brandId)
    .select()
    .single();
  if (error || !data)
    throw new Error(`Failed to update product: ${error?.message}`);
  return data as BrandProductRow;
}

export async function dbArchiveProduct(
  productId: string,
  brandId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .update({ status: "archived" })
    .eq("id", productId)
    .eq("brand_id", brandId);
  if (error) throw new Error(`Failed to archive product: ${error.message}`);
}

// ─── 제품 이미지 관리 ─────────────────────────────────────────────────────────

export async function dbAddProductImage(
  input: AddProductImageInput,
  brandId: string,
): Promise<BrandProductRow> {
  // 현재 images 배열 조회
  const product = await dbGetProduct(input.productId, brandId);
  if (!product) throw new Error("Product not found");

  const newImage: ProductImage = {
    role: input.role,
    r2_key: input.r2Key,
    url: input.url,
    width: input.width,
    height: input.height,
    has_transparent_bg: input.hasTransparentBg ?? false,
    order_idx: product.images.length,
  };

  const updatedImages = [...product.images, newImage];

  // hero 이미지가 추가되면 legacy 필드도 동기화
  const legacyPatch: Partial<BrandProductRow> = { images: updatedImages };
  if (input.role === "hero" || product.images.length === 0) {
    legacyPatch.image_r2_key = input.r2Key;
    legacyPatch.image_url = input.url;
    legacyPatch.has_transparent_bg = input.hasTransparentBg ?? false;
  }

  return dbUpdateProduct(input.productId, brandId, legacyPatch);
}

export async function dbRemoveProductImage(
  productId: string,
  r2Key: string,
  brandId: string,
): Promise<BrandProductRow> {
  const product = await dbGetProduct(productId, brandId);
  if (!product) throw new Error("Product not found");

  const updatedImages = product.images
    .filter((img) => img.r2_key !== r2Key)
    .map((img, i) => ({ ...img, order_idx: i }));

  const newHero = updatedImages[0] ?? null;
  const legacyPatch = {
    images: updatedImages,
    image_r2_key: newHero?.r2_key ?? null,
    image_url: newHero?.url ?? null,
  };
  return dbUpdateProduct(productId, brandId, legacyPatch);
}

// ─── hero 이미지 URL 조회 ─────────────────────────────────────────────────────

export function getProductHeroImageUrl(
  product: BrandProductRow,
): string | null {
  const hero = product.images.find((img) => img.role === "hero");
  return hero?.url ?? product.image_url ?? null;
}

export function getProductHeroImageHasTransparentBg(
  product: BrandProductRow,
): boolean {
  const hero = product.images.find((img) => img.role === "hero");
  return hero?.has_transparent_bg ?? product.has_transparent_bg ?? false;
}
