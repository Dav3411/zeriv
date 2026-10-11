import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadBufferToR2, getR2PublicUrl } from "@/lib/r2";
import crypto from "crypto";

export const runtime = "nodejs";

const COPYRIGHT_TRANSFORM_PROMPT = `Recreate this image as a copyright-free reference template.

Keep the same composition, camera angle, lighting, color palette, and mood.

Replace ALL products, bottles, jars, tubes, boxes, containers, and commercial objects with simple white geometric primitives (cylinder, sphere, cube, rectangular prism) that roughly match the original object's proportions. The primitives must be solid matte white with no labels, no texture, no color, no transparency.

Replace any person with a featureless white mannequin in the same pose. No hair, no face, no skin detail.

If the background is complex or recognizable (real location, branded interior, identifiable street): generate a similar but different background — same scene type but different specific details.
If the background is simple, plain, solid color, gradient, or abstract graphic: keep it as is, do not change it.

Remove all logos, brand text, and signage.

The result should look like a clean product photography template with white geometric placeholder objects.`;

async function transformForCopyright(imageBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model =
    process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  // 페이로드 크기 제한용 리사이즈 (비율 유지)
  const sharp = (await import("sharp")).default;
  const meta = await sharp(imageBuffer).metadata();
  let buf = imageBuffer;
  if ((meta.width ?? 0) > 1024 || (meta.height ?? 0) > 1024) {
    buf = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: "inside" })
      .png()
      .toBuffer();
  }
  const b64 = buf.toString("base64");

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: b64 } },
          { text: COPYRIGHT_TRANSFORM_PROMPT },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { imageSize: "2K", aspectRatio: "1:1" },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = (part as { inlineData?: { data?: string } }).inlineData?.data;
    if (typeof data === "string" && data.length > 0) {
      return Buffer.from(data, "base64");
    }
  }
  throw new Error("Gemini returned no image for copyright transformation");
}

const R2_BUCKET = process.env.R2_BUCKET ?? "";
const VALID_PIPELINES = ["photo_remix", "imagine", "object", "product"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * GET /api/reference-gallery?pipeline=photo_remix
 * Returns admin (global) + user's own gallery images for the given pipeline.
 */
export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pipeline = url.searchParams.get("pipeline")?.trim();
  if (!pipeline || !VALID_PIPELINES.includes(pipeline)) {
    return NextResponse.json(
      { error: "Invalid pipeline parameter" },
      { status: 400 },
    );
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from("reference_gallery")
    .select(
      "id, user_id, pipeline_type, image_key, label, sort_order, created_at",
    )
    .eq("pipeline_type", pipeline)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  if (dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 });

  const images = await Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      isAdmin: row.user_id === null,
      pipelineType: row.pipeline_type,
      imageUrl: row.image_key ? await getR2PublicUrl(row.image_key) : null,
      label: row.label,
      createdAt: row.created_at,
    })),
  );

  return NextResponse.json({ images });
}

/**
 * POST /api/reference-gallery
 * Upload a new gallery image.
 * - With x-admin-secret header: admin mode (user_id = NULL, visible to all)
 * - Without: user mode (user_id = current user)
 */
export async function POST(req: Request) {
  // Determine admin vs user mode
  const adminSecret = req.headers.get("x-admin-secret");
  let userId: string | null = null;
  let isAdmin = false;

  // 이 헤더의 **값**은 보안 수단이 아님. admin 모드 분기 신호로만 사용되며,
  // 실제 권한 검증은 requireCreditsAdmin(ADMIN_USER_IDS allowlist)에서 수행함.
  if (adminSecret) {
    const adminResult = await requireCreditsAdmin(req);
    if (!adminResult.ok) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status },
      );
    }
    isAdmin = true;
  } else {
    const authResult = await requireUserId(req);
    if (authResult.error || !authResult.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = authResult.userId;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    console.error(
      "[Gallery] FormData parse error:",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const pipeline = (formData.get("pipeline") as string | null)?.trim();
  const imageFile = formData.get("image") as File | null;
  const label = (formData.get("label") as string | null)?.trim() ?? "";

  if (!pipeline || !VALID_PIPELINES.includes(pipeline)) {
    return NextResponse.json({ error: "Invalid pipeline" }, { status: 400 });
  }
  if (!imageFile || imageFile.size === 0) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }
  if (imageFile.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const imageKey = isAdmin
    ? `gallery/admin/${pipeline}/${id}.png`
    : `gallery/${userId}/${pipeline}/${id}.png`;

  let buf = Buffer.from(await imageFile.arrayBuffer());

  // Admin 모드: 저작권 변환 적용
  if (isAdmin) {
    try {
      console.log(
        `[Gallery] Starting copyright transform for ${pipeline} (${buf.length} bytes)...`,
      );
      const startMs = Date.now();
      buf = Buffer.from(await transformForCopyright(buf));
      console.log(
        `[Gallery] Copyright transform done in ${((Date.now() - startMs) / 1000).toFixed(1)}s → ${buf.length} bytes`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[Gallery] Copyright transform failed: ${msg}`);
      return NextResponse.json(
        { error: `Copyright transform failed: ${msg}` },
        { status: 500 },
      );
    }
  }

  await uploadBufferToR2({
    bucket: R2_BUCKET,
    key: imageKey,
    contentType: "image/png",
    body: buf,
  });

  const { error: insertErr } = await supabaseAdmin
    .from("reference_gallery")
    .insert({
      id,
      user_id: isAdmin ? null : userId,
      pipeline_type: pipeline,
      image_key: imageKey,
      label,
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id, imageKey });
}
