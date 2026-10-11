import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import type { ColorPalette, Style } from "./style.types";

const MAX_RETRIES = 3;

// ─── Utilities ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): {
  r: number;
  g: number;
  b: number;
  alpha: number;
} {
  const cleaned = hex.replace(/^#/, "");
  const int = parseInt(cleaned, 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
    alpha: 255,
  };
}

export function isValidPalette(
  palette: ColorPalette | null | undefined,
): boolean {
  if (!palette) return false;
  return Object.values(palette).some(
    (h) => typeof h === "string" && h.length > 0,
  );
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

function getGeminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────

async function buildColorSwatchBuffer(palette: ColorPalette): Promise<Buffer> {
  const entries = Object.entries(palette).filter(
    ([, hex]) => typeof hex === "string" && hex.length > 0,
  );
  if (entries.length === 0) {
    throw new Error("buildColorSwatchBuffer: empty palette");
  }

  const BLOCK_W = 400;
  const BLOCK_H = 160;
  const TOTAL_W = BLOCK_W * entries.length;

  const blocks = await Promise.all(
    entries.map(([, hex], i) =>
      sharp({
        create: {
          width: BLOCK_W,
          height: BLOCK_H,
          channels: 4,
          background: hexToRgb(hex),
        },
      })
        .png()
        .toBuffer()
        .then((buf) => ({ input: buf, top: 0, left: i * BLOCK_W })),
    ),
  );

  return sharp({
    create: {
      width: TOTAL_W,
      height: BLOCK_H,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite(blocks)
    .png()
    .toBuffer();
}

// ─── Prop Image (Gemini) ──────────────────────────────────────────────────────

export interface PropSheetParams {
  propKeywords: string[];
  moodKeywords?: string[];
  lighting?: {
    source?: string;
    direction?: string;
    contrast?: string;
    color_temperature?: string;
  };
  texture?: { finish?: string };
  scene?: { background?: string; setting?: string };
  colorPalette?: ColorPalette;
}

function formatLighting(l?: PropSheetParams["lighting"]): string {
  if (!l) return "n/a";
  const parts = [l.source, l.direction, l.contrast, l.color_temperature].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : "n/a";
}

function formatScene(s?: PropSheetParams["scene"]): string {
  if (!s) return "n/a";
  const parts = [s.setting, s.background].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "n/a";
}

function buildPropSheetPrompt(params: PropSheetParams): string {
  const {
    propKeywords,
    moodKeywords = [],
    lighting,
    texture,
    scene,
    colorPalette,
  } = params;

  const paletteHexes = Object.values(colorPalette ?? {}).filter(
    (h): h is string => typeof h === "string" && h.length > 0,
  );
  const paletteStr = paletteHexes.length > 0 ? paletteHexes.join(", ") : "n/a";
  const mood = moodKeywords.length > 0 ? moodKeywords.join(", ") : "n/a";
  const lightingStr = formatLighting(lighting);
  const textureStr = texture?.finish ?? "n/a";
  const sceneStr = formatScene(scene);
  const props = propKeywords.join(", ");

  return `A clean product prop sheet on a pure white (#FFFFFF) background.

Style atmosphere context (use as overall mood/feel reference, NOT as background):
- Color palette: ${paletteStr}
- Mood: ${mood}
- Lighting feel: ${lightingStr}
- Texture feel: ${textureStr}
- Scene vibe: ${sceneStr}

Show each of the following items as individual cutout objects, clearly separated with generous spacing: ${props}.

Requirements:
- Pure white (#FFFFFF) background only — no environment, no shadows, no props around
- Each item fully visible, no cropping
- Clean sharp edges, no drop shadows
- No text labels, no borders
- Arrange in a single row or simple grid
- Photorealistic style
- Let the mood/color palette above subtly influence the object rendering (lighting warmth, surface feel) but never add a background`;
}

async function buildPropImageBuffer(params: PropSheetParams): Promise<Buffer> {
  const ai = getGeminiClient();
  const model = getGeminiImageModel();
  const prompt = buildPropSheetPrompt(params);

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (typeof data === "string" && data.length > 0) {
          return Buffer.from(data, "base64");
        }
      }

      throw new Error("Gemini returned no image data");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[buildPropImageBuffer] attempt ${attempt} failed:`,
        lastError.message,
      );
      if (attempt === MAX_RETRIES) break;
    }
  }

  throw new Error(
    `buildPropImageBuffer failed after ${MAX_RETRIES} attempts: ${lastError.message}`,
  );
}

// ─── Style Sheet (combined) ───────────────────────────────────────────────────

export async function generateStyleSheet(
  palette: ColorPalette,
  propParams: PropSheetParams,
): Promise<Buffer> {
  const hasPalette = isValidPalette(palette);
  const hasProps = (propParams.propKeywords?.length ?? 0) > 0;

  if (!hasPalette && !hasProps) {
    throw new Error("Both palette and propKeywords are empty");
  }

  if (hasPalette && !hasProps) {
    return buildColorSwatchBuffer(palette);
  }

  if (!hasPalette && hasProps) {
    return buildPropImageBuffer(propParams);
  }

  // 둘 다 있음 → 세로 합성
  const [swatchBuf, propBuf] = await Promise.all([
    buildColorSwatchBuffer(palette),
    buildPropImageBuffer(propParams),
  ]);

  // 색 개수에 따라 swatch 너비가 달라지므로 둘 다 1200px로 정규화
  const swatchBufResized = await sharp(swatchBuf)
    .resize({ width: 1200 })
    .png()
    .toBuffer();
  const swatchMeta = await sharp(swatchBufResized).metadata();
  const swatchH = swatchMeta.height ?? 160;

  const propBufResized = await sharp(propBuf)
    .resize({ width: 1200 })
    .png()
    .toBuffer();
  const propMeta = await sharp(propBufResized).metadata();
  const propH = propMeta.height ?? 0;

  const combined = await sharp({
    create: {
      width: 1200,
      height: swatchH + propH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([
      { input: swatchBufResized, top: 0, left: 0 },
      { input: propBufResized, top: swatchH, left: 0 },
    ])
    .png()
    .toBuffer();

  return combined;
}

// ─── Key Visual (Gemini w/ style sheet reference) ─────────────────────────────

function buildKeyVisualPrompt(style: {
  color_palette: ColorPalette;
  lighting: Style["lighting"];
  texture: Style["texture"];
  mood_keywords: string[];
  scene: Style["scene"];
  prop_keywords: string[];
}): string {
  const {
    color_palette,
    lighting,
    texture,
    mood_keywords,
    scene,
    prop_keywords,
  } = style;

  const lightingStr =
    [
      lighting?.source,
      lighting?.direction,
      lighting?.contrast,
      lighting?.color_temperature,
    ]
      .filter(Boolean)
      .join(", ") || "n/a";

  const sceneStr =
    [scene?.setting, scene?.background, scene?.depth]
      .filter(Boolean)
      .join(", ") || "n/a";

  const paletteStr =
    Object.entries(color_palette ?? {})
      .filter(([, hex]) => typeof hex === "string" && hex.length > 0)
      .map(([name, hex]) => `${name} ${hex}`)
      .join(", ") || "n/a";

  return `You are a creative director. Generate a single high-quality product photography key visual that exemplifies this brand style.

Style parameters:
- Color palette: ${paletteStr}
- Lighting: ${lightingStr}
- Texture: ${texture?.finish ?? "n/a"}
- Mood: ${mood_keywords.length > 0 ? mood_keywords.join(", ") : "n/a"}
- Scene: ${sceneStr}
- Props/elements: ${prop_keywords.length > 0 ? prop_keywords.join(", ") : "n/a"}

The attached style sheet shows the color palette and prop elements.

Generate a stylized product photography scene — imagine a single generic lifestyle/beauty product placed naturally in this scene. The product doesn't need to be specific; create a compelling visual that shows what a real product shot in this style would look like.

Requirements:
- Exactly ONE product in the scene — no multiples, no duplicates
- Photorealistic, high quality
- Embody all style parameters above
- Natural product placement
- No text, no logos, no watermarks`;
}

export async function generateKeyVisual(
  style: {
    color_palette: ColorPalette;
    lighting: Style["lighting"];
    texture: Style["texture"];
    mood_keywords: string[];
    scene: Style["scene"];
    prop_keywords: string[];
  },
  styleSheetBuffer: Buffer,
): Promise<Buffer> {
  const ai = getGeminiClient();
  const model = getGeminiImageModel();
  const prompt = buildKeyVisualPrompt(style);
  const styleSheetBase64 = styleSheetBuffer.toString("base64");

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: styleSheetBase64,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "1:1" },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (typeof data === "string" && data.length > 0) {
          return Buffer.from(data, "base64");
        }
      }

      throw new Error("Gemini returned no image data");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[generateKeyVisual] attempt ${attempt} failed:`,
        lastError.message,
      );
      if (attempt === MAX_RETRIES) break;
    }
  }

  throw new Error(
    `generateKeyVisual failed after ${MAX_RETRIES} attempts: ${lastError.message}`,
  );
}
