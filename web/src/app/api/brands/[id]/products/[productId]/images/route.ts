import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  dbGetProduct,
  dbUpdateProduct,
  dbAddProductImage,
  dbRemoveProductImage,
} from "@/lib/brandProduct/brandProduct.repository";
import { deleteObjectFromR2, uploadBufferToR2, getR2PublicUrl } from "@/lib/r2";
import { resolveProductUrls } from "@/lib/brandProduct/productUrlResolver";
import type { ProductImageRole } from "@/lib/brandProduct/brandProduct.types";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

const R2_BUCKET = process.env.R2_BUCKET ?? "";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// POST /api/brands/[id]/products/[productId]/images — 제품 이미지 추가
export async function POST(
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

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const imageFiles: File[] = [];
    for (const entry of formData.getAll("images")) {
      if (entry instanceof File && entry.size > 0) imageFiles.push(entry);
    }
    if (imageFiles.length === 0)
      return NextResponse.json({ error: "No valid images" }, { status: 400 });

    // 파일 타입 및 크기 검증
    for (const file of imageFiles) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}` },
          { status: 415 },
        );
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "File too large. Maximum 20MB per image." },
          { status: 413 },
        );
      }
    }

    const existingCount = (existing.images ?? []).length;

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const ext = EXT_MAP[file.type] ?? "bin";
      const r2Key = `products/${productId}/${crypto.randomUUID()}.${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await uploadBufferToR2({
        bucket: R2_BUCKET,
        key: r2Key,
        contentType: file.type || "image/png",
        body: buf,
      });
      const url = await getR2PublicUrl(r2Key);
      await dbAddProductImage(
        {
          productId,
          role: existingCount + i === 0 ? "hero" : "angle",
          r2Key,
          url,
        },
        brandId,
      );
    }

    const updated = await dbGetProduct(productId, brandId);
    const resolved = updated ? await resolveProductUrls(updated) : null;
    return NextResponse.json({ product: resolved }, { status: 201 });
  } else {
    // 기존 JSON 방식 (하위 호환)
    const body = (await req.json()) as {
      imageUrl?: string;
      r2Key?: string;
      role?: ProductImageRole;
      width?: number;
      height?: number;
      hasTransparentBg?: boolean;
    };

    if (!body.imageUrl)
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    if (!body.r2Key)
      return NextResponse.json({ error: "r2Key required" }, { status: 400 });
    if (!body.r2Key.startsWith(`products/${productId}/`))
      return NextResponse.json({ error: "Invalid r2Key" }, { status: 400 });
    if (!body.role)
      return NextResponse.json({ error: "role required" }, { status: 400 });

    const product = await dbAddProductImage(
      {
        productId,
        role: body.role,
        r2Key: body.r2Key,
        url: body.imageUrl,
        width: body.width,
        height: body.height,
        hasTransparentBg: body.hasTransparentBg,
      },
      brandId,
    );

    return NextResponse.json(
      { product: await resolveProductUrls(product) },
      { status: 201 },
    );
  }
}

// PATCH /api/brands/[id]/products/[productId]/images — 이미지 순서 변경 (대표 이미지 설정)
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

  const { order } = (await req.json()) as { order: string[] };
  if (!Array.isArray(order) || order.length === 0)
    return NextResponse.json({ error: "order required" }, { status: 400 });

  // r2_key 순서대로 images 배열 재정렬
  const imageMap = new Map(existing.images.map((img) => [img.r2_key, img]));
  const reordered = order
    .map((key, i) => {
      const img = imageMap.get(key);
      if (!img) return null;
      return {
        ...img,
        order_idx: i,
        role: (i === 0
          ? "hero"
          : "angle") as import("@/lib/brandProduct/brandProduct.types").ProductImageRole,
      };
    })
    .filter(Boolean) as typeof existing.images;

  // 대표 이미지(첫 번째) legacy 필드 동기화
  const hero = reordered[0];
  const product = await dbUpdateProduct(productId, brandId, {
    images: reordered,
    image_r2_key: hero?.r2_key ?? existing.image_r2_key,
    image_url: hero?.url ?? existing.image_url,
  });

  return NextResponse.json({ product: await resolveProductUrls(product) });
}

// DELETE /api/brands/[id]/products/[productId]/images?r2Key=xxx — 제품 이미지 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, productId } = await params;
  const r2Key = new URL(req.url).searchParams.get("r2Key");
  if (!r2Key)
    return NextResponse.json({ error: "r2Key required" }, { status: 400 });
  if (!r2Key.startsWith(`products/${productId}/`))
    return NextResponse.json({ error: "Invalid r2Key" }, { status: 400 });

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const existing = await dbGetProduct(productId, brandId);
  if (!existing)
    return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const product = await dbRemoveProductImage(productId, r2Key, brandId);

  if (R2_BUCKET) {
    await deleteObjectFromR2({ bucket: R2_BUCKET, key: r2Key }).catch((e) =>
      console.error("[product images DELETE] R2 삭제 실패:", e),
    );
  }

  return NextResponse.json({ product: await resolveProductUrls(product) });
}
