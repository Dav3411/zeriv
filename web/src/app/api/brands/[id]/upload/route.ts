import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireUserId } from "@/lib/authServer";
import { uploadBufferToR2 } from "@/lib/r2";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

const R2_BUCKET     = process.env.R2_BUCKET     ?? "";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES     = 10 * 1024 * 1024; // 10 MB

// POST /api/brands/[id]/upload
// body: FormData { file: File }
// returns: { imageUrl: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  const brandAccess = await dbGetBrand(brandId, userId);
  if (!brandAccess)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "file field required" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES)
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = `brands/${brandId}/refs/${crypto.randomUUID()}.${ext}`;

  await uploadBufferToR2({ bucket: R2_BUCKET, key, contentType: file.type, body: buffer });

  const imageUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;
  return NextResponse.json({ imageUrl, r2Key: key }, { status: 201 });
}
