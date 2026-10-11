/**
 * backgroundImageProvider.ts — 배경 이미지 생성 provider 추상화
 *
 * Interface + fal.ai adapter.
 * provider 교체 시 FalBackgroundImageProvider를 새 구현으로 바꾸기만 하면 된다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateImageInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
}

export interface GenerateImageOutput {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg";
  seed?: number;
}

export interface BackgroundImageProvider {
  generate(input: GenerateImageInput): Promise<GenerateImageOutput>;
}

// ─────────────────────────────────────────────────────────────────────────────
// fal.ai adapter
// ─────────────────────────────────────────────────────────────────────────────

const FAL_BG_MODEL =
  process.env.FAL_BACKGROUND_MODEL?.trim() || "fal-ai/fast-sdxl";

export class FalBackgroundImageProvider implements BackgroundImageProvider {
  async generate(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const key = process.env.FAL_KEY?.trim();
    if (!key) throw new Error("FAL_KEY is not set");

    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: key });

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      image_size: { width: input.width, height: input.height },
      num_inference_steps: 30,
      guidance_scale: 7.5,
      num_images: 1,
      enable_safety_checker: false,
    };
    if (input.negativePrompt) payload.negative_prompt = input.negativePrompt;
    if (input.seed != null) payload.seed = input.seed;

    const result = await fal.subscribe(FAL_BG_MODEL, { input: payload, logs: false });

    const data = result.data as {
      images?: Array<{ url?: string; content_type?: string }>;
      image?: { url?: string; content_type?: string };
      seed?: number;
    };

    const img = data?.images?.[0] ?? data?.image;
    if (!img?.url) throw new Error("fal.ai background generation returned no image URL");

    // Fetch image buffer
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Failed to fetch generated image: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Determine mime type
    const rawMime = img.content_type ?? "image/png";
    const mimeType: "image/png" | "image/jpeg" =
      rawMime.includes("jpeg") || rawMime.includes("jpg") ? "image/jpeg" : "image/png";

    return { buffer, mimeType, seed: data.seed };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default singleton (swappable for tests)
// ─────────────────────────────────────────────────────────────────────────────

let _provider: BackgroundImageProvider = new FalBackgroundImageProvider();

export function setBackgroundImageProvider(p: BackgroundImageProvider): void {
  _provider = p;
}

export function getBackgroundImageProvider(): BackgroundImageProvider {
  return _provider;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry wrapper
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

export async function generateWithRetry(
  input: GenerateImageInput
): Promise<GenerateImageOutput> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await getBackgroundImageProvider().generate(input);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[bg-provider] attempt ${attempt + 1} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Background image generation failed after ${MAX_RETRIES + 1} attempts: ${msg}`);
}
