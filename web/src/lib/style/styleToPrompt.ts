import type { Style } from "./style.types";

// ─── Hex → natural language color description ────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function describeColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;

  if (lightness > 0.9) return "white";
  if (lightness < 0.1) return "black";

  const warmth = r - b;
  if (warmth > 80) {
    if (r > 200 && g > 150) return "warm beige tones";
    if (r > 200 && g < 100) return "warm red tones";
    return "warm earthy tones";
  }
  if (warmth < -80) {
    if (b > 180) return "cool blue tones";
    return "cool tones";
  }
  if (g > r && g > b) return "natural green tones";
  if (lightness > 0.7) return "soft neutral tones";
  if (lightness < 0.3) return "deep dark tones";
  return "muted tones";
}

// ─── Enum → prompt phrase mappers ────────────────────────────────────────────

function describeLighting(style: Style): string {
  const parts: string[] = [];

  const contrastMap = {
    soft: "soft",
    medium: "balanced",
    hard: "dramatic",
  } as const;
  const sourceMap = {
    natural: "natural",
    studio: "studio",
    mixed: "mixed",
  } as const;
  const dirMap = {
    front: "front",
    side: "side",
    back: "backlit",
    top: "overhead",
  } as const;
  const tempMap = { warm: "warm", neutral: "neutral", cool: "cool" } as const;

  parts.push(
    `${contrastMap[style.lighting.contrast]} ${sourceMap[style.lighting.source]} lighting`,
  );
  parts.push(`${dirMap[style.lighting.direction]} light`);
  parts.push(`${tempMap[style.lighting.color_temperature]} color temperature`);

  return parts.join(", ");
}

function describeTexture(style: Style): string {
  const finishMap = {
    matte: "matte finish",
    glossy: "glossy finish",
    satin: "satin finish",
    metallic: "metallic finish",
  } as const;
  return finishMap[style.texture.finish];
}

function describeColors(style: Style): string {
  const entries = Object.entries(style.color_palette ?? {}).filter(
    ([, hex]) => typeof hex === "string" && hex.length > 0,
  );
  if (entries.length === 0) return "";
  return entries
    .map(([name, hex]) => `${name}: ${describeColor(hex)}`)
    .join(", ");
}

function describeMood(style: Style): string {
  if (style.mood_keywords.length === 0) return "";
  return style.mood_keywords.slice(0, 5).join(", ");
}

function describeScene(style: Style): string {
  const s = style.scene;
  if (!s || !s.background) return "";
  const depthMap = {
    flat: "flat background",
    shallow: "shallow space",
    deep: "deep space",
  } as const;
  const depth = s.depth ? depthMap[s.depth] : "";
  return [s.background, depth].filter(Boolean).join(", ");
}

function describeProps(style: Style): string {
  if (!style.prop_keywords || style.prop_keywords.length === 0) return "";
  return style.prop_keywords.slice(0, 5).join(", ");
}

// ─── Default negative prompt tokens ─────────────────────────────────────────

const DEFAULT_NEGATIVE = [
  "low quality",
  "blurry",
  "distorted",
  "deformed",
  "watermark",
  "text overlay",
  "oversaturated",
  "underexposed",
  "noise",
  "artifacts",
];

// ─── Main export ─────────────────────────────────────────────────────────────

export function styleToPrompt(
  style: Style,
  userPrompt?: string,
): { positive: string; negative: string } {
  const segments: string[] = [];

  // 1. User prompt takes highest priority
  if (userPrompt?.trim()) {
    segments.push(userPrompt.trim());
  }

  // 2. Mood / atmosphere keywords
  const mood = describeMood(style);
  if (mood) segments.push(mood);

  // 3. Prop keywords
  const props = describeProps(style);
  if (props) segments.push(props);

  // 4. Lighting
  segments.push(describeLighting(style));

  // 5. Texture
  segments.push(describeTexture(style));

  // 6. Scene
  const scene = describeScene(style);
  if (scene) segments.push(scene);

  // 7. Color palette
  segments.push(describeColors(style));

  const positive = segments.join(", ");
  const negative = DEFAULT_NEGATIVE.join(", ");

  return { positive, negative };
}
