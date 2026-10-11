import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { dbGetStyle, dbUpdateStyle } from "@/lib/style/style.repository";
import { styleToPrompt } from "@/lib/style/styleToPrompt";
import { uploadBufferToR2, r2KeyToPublicUrl } from "@/lib/r2";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";
export const maxDuration = 120;

const R2_BUCKET = process.env.R2_BUCKET ?? "";
const XAI_API_KEY = process.env.XAI_API_KEY?.trim();
const GROK_IMAGE_MODEL = "grok-imagine-image";

// POST /api/brands/[id]/styles/[styleId]/thumbnail
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; styleId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, styleId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // 1) 스타일 조회 + 브랜드 소속 확인
  const style = await dbGetStyle(styleId, brandId);
  if (!style)
    return NextResponse.json({ error: "Style not found" }, { status: 404 });

  if (!XAI_API_KEY)
    return NextResponse.json(
      { error: "XAI_API_KEY is not configured" },
      { status: 500 },
    );

  // 2) 프롬프트 조합
  const { positive } = styleToPrompt(style);
  const prompt = `product photography, a single hero product centered in frame, no people, no humans, ${positive}, commercial product shot, studio quality`;

  // 3) Grok 이미지 생성 (b64_json — URL 만료 문제 없음)
  const grokRes = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROK_IMAGE_MODEL,
      prompt,
      n: 1,
      aspect_ratio: "1:1",
      response_format: "b64_json",
    }),
  });

  if (!grokRes.ok) {
    const errText = await grokRes.text().catch(() => "");
    console.error("[thumbnail] Grok error:", errText);
    return NextResponse.json(
      { error: `Grok image generation failed: ${grokRes.status}` },
      { status: 500 },
    );
  }

  const grokData = (await grokRes.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = grokData.data?.[0];
  if (!item)
    return NextResponse.json(
      { error: "Grok returned no image data" },
      { status: 500 },
    );

  let buffer: Buffer;
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const imageRes = await fetch(item.url);
    if (!imageRes.ok)
      return NextResponse.json(
        { error: "Failed to fetch generated image" },
        { status: 500 },
      );
    buffer = Buffer.from(await imageRes.arrayBuffer());
  } else {
    return NextResponse.json(
      { error: "Grok returned no usable image" },
      { status: 500 },
    );
  }
  const r2Key = `brands/${brandId}/styles/${styleId}/thumbnail.png`;

  await uploadBufferToR2({
    bucket: R2_BUCKET,
    key: r2Key,
    contentType: "image/png",
    body: buffer,
  });

  // 5) public URL 계산 + DB 업데이트 (DB에는 r2 key만 저장, URL은 serve time에 변환)
  // 신규 계약: r2KeyToPublicUrl를 우선 사용 (production에서는 R2_PUBLIC_URL 필수).
  // 개발 환경에서 R2_PUBLIC_URL이 비어 throw될 경우에만 signed URL fallback.
  let publicUrl: string;
  try {
    publicUrl = r2KeyToPublicUrl(r2Key);
  } catch {
    const { getR2PublicUrl } = await import("@/lib/r2");
    publicUrl = await getR2PublicUrl(r2Key);
  }
  await dbUpdateStyle(styleId, brandId, { example_images: [r2Key] });

  return NextResponse.json({ imageUrl: publicUrl });
}
