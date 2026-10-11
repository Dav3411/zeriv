import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  dbCreateProduct,
  dbListProducts,
  dbAddProductImage,
  dbGetProduct,
} from "@/lib/brandProduct/brandProduct.repository";
import type { CreateBrandProductInput } from "@/lib/brandProduct/brandProduct.types";
import { uploadBufferToR2, getR2PublicUrl } from "@/lib/r2";
import { resolveProductUrls } from "@/lib/brandProduct/productUrlResolver";
import { createImageSheet } from "@/lib/imageSheet";
import crypto from "crypto";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

const R2_BUCKET = process.env.R2_BUCKET ?? "zeriv-assets";

/** GET /api/brands/[id]/products — 제품 목록 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const statusParam = new URL(req.url).searchParams.get("status");
  const statusFilter = statusParam === "archived" ? "archived" : "active";
  const products = await dbListProducts(brandId, statusFilter);

  // Refresh signed URLs for all product images (stored URLs may have expired)
  const refreshed = await Promise.all(products.map(resolveProductUrls));

  return NextResponse.json({ products: refreshed });
}

/** POST /api/brands/[id]/products — 제품 등록 (JSON or FormData with image) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";

  let name = "";
  let body: Partial<Omit<CreateBrandProductInput, "brandId">> = {};
  const imageFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    name = (formData.get("name") as string | null)?.trim() ?? "";
    // Support both "image" (single) and "images" (multiple)
    const singleImage = formData.get("image") as File | null;
    if (singleImage && singleImage.size > 0) imageFiles.push(singleImage);
    for (const entry of formData.getAll("images")) {
      if (entry instanceof File && entry.size > 0) imageFiles.push(entry);
    }
    const cat =
      (formData.get("productCategory") as string | null)?.trim() || "skincare";
    const desc =
      (formData.get("description") as string | null)?.trim() || undefined;
    body = {
      name,
      productCategory: cat as CreateBrandProductInput["productCategory"],
      packagingType: "bottle",
      packagingFinish: "glossy",
      packagingMaterial: "plastic",
      description: desc,
    };
  } else {
    body = (await req.json()) as Omit<CreateBrandProductInput, "brandId">;
    name = body.name ?? "";
  }

  if (!name)
    return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.productCategory) body.productCategory = "skincare";

  const product = await dbCreateProduct(
    { ...(body as Omit<CreateBrandProductInput, "brandId">), brandId },
    userId,
  );

  // Upload individual images
  const imageBuffers: Buffer[] = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      imageBuffers.push(buf);
      const ext = file.type === "image/jpeg" ? "jpg" : "png";
      const r2Key = `products/${product.id}/${crypto.randomUUID()}.${ext}`;
      await uploadBufferToR2({
        bucket: R2_BUCKET,
        key: r2Key,
        contentType: file.type || "image/png",
        body: buf,
      });
      const url = await getR2PublicUrl(r2Key);
      await dbAddProductImage(
        { productId: product.id, role: i === 0 ? "hero" : "angle", r2Key, url },
        brandId,
      );
    } catch (e) {
      console.error(`Failed to upload product image ${i}:`, e);
    }
  }

  // Generate & upload product image sheet (2장 이상일 때)
  if (imageBuffers.length >= 2) {
    try {
      const sheetBuffer = await createImageSheet(imageBuffers);
      const sheetKey = `products/${product.id}/sheet.png`;
      await uploadBufferToR2({
        bucket: R2_BUCKET,
        key: sheetKey,
        contentType: "image/png",
        body: sheetBuffer,
      });
      // DB에 시트 키 저장
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
      );
      await supabase
        .from("products")
        .update({ product_sheet_key: sheetKey })
        .eq("id", product.id);
    } catch (e) {
      console.error("Failed to generate product sheet:", e);
    }
  }

  // 응답 직전 최신 상태를 다시 조회하여 변환 (이미지·시트 키가 별도 update로 들어감)
  const fresh = (await dbGetProduct(product.id, brandId)) ?? product;
  const resolved = await resolveProductUrls(fresh);
  return NextResponse.json({ product: resolved }, { status: 201 });
}
