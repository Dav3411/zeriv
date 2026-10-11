import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { requireUserId } from "@/lib/authServer";

export const runtime = "nodejs";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";

const COUPANG_THUMBNAIL_PROMPT = `Edit the uploaded product image into a compliant Coupang-style marketplace thumbnail.

Use the uploaded image as the single source of truth. Show only the exact product in its real delivered condition, exactly as the customer would receive it. Do not show the product in use. Do not add props, accessories, gifts, bonus items, extra components, decorative elements, hands, models, or anything not included in the actual shipped product.

Create a clean square 1:1 product image on a pure solid white background (#FFFFFF). Place the product exactly in the center of the frame. Scale the product up so it fills the frame as much as possible while remaining fully visible. The product should appear large and tightly framed, with only a small, clean, even white margin around it. Do not leave excessive empty white space.

Preserve the product's true appearance faithfully: original shape, proportions, aspect ratio, colors, materials, texture, packaging, labels, printed details, logo as physically present on the real product, and all small details. Do not distort, stretch, compress, warp, redesign, simplify, stylize, or reinterpret the product.

Use only a normal standard product-photo camera angle. Do not use unusual, dramatic, tilted, top-down, ultra-wide, or perspective-heavy angles. The entire product must be in sharp focus from edge to edge. Use bright, even, studio-quality lighting so that small details are clearly visible.

Do not add any shadow, drop shadow, contact shadow, cast shadow, or reflection of any kind. The product must appear completely shadowless on the pure white background.

Strictly exclude all overlays and promotional elements:
- no text
- no discount phrases
- no sale badges
- no graphic elements
- no borders
- no stickers
- no watermarks
- no extra logos added separately

Show only the real delivered product appearance, not a lifestyle or usage scene.

Output exactly one final image.

Technical requirements:
- square 1:1 image
- pure white background (#FFFFFF)
- centered product
- tightly framed product that fills the image as much as possible without being cropped
- minimum 1000 x 1000 resolution
- recommended high-quality 2048 x 2048
- no transparency
- no overlays`;

export async function POST(req: Request) {
  const { error: authErr, userId } = await requireUserId(req);
  if (authErr || !userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as Blob | null;
  if (!file) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 20MB)" },
      { status: 413 },
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = (file as File).type || "image/jpeg";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data: base64, mimeType } },
              { text: COUPANG_THUMBNAIL_PROMPT },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (part as any).inlineData?.data;
        if (typeof data === "string" && data.length > 0) {
          return NextResponse.json({
            imageBase64: data,
            mimeType: "image/png",
          });
        }
      }
      return NextResponse.json(
        { error: "Gemini returned no image" },
        { status: 500 },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTransient = /rate_limit|overloaded|503|529|timeout/i.test(msg);
      if (isTransient && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2 ** (attempt + 1) * 1000));
        continue;
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Failed after retries" }, { status: 500 });
}
