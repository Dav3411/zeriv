/**
 * falPersona.ts — Generate model candidate images via fal.ai z-image/turbo/lora
 */
import { fal } from "@fal-ai/client";

const FAL_KEY = process.env.FAL_KEY ?? "";
const Z_REAL_LORA_URL =
  process.env.FAL_Z_REAL_LORA_URL ??
  "https://huggingface.co/JSCS/z-real-lora/resolve/main/Z-Real-v1.0.safetensors";
const Z_REAL_LORA_STRENGTH = parseFloat(
  process.env.FAL_Z_REAL_LORA_STRENGTH ?? "0.8",
);

export function isFalAvailable(): boolean {
  return !!FAL_KEY;
}

interface FalCandidateResult {
  image_b64: string;
  face_seed: number;
  face_prompt: string;
  model: string;
  lora: string;
}

export async function generateOne(
  prompt: string,
  seed: number,
): Promise<FalCandidateResult> {
  const result = await fal.subscribe("fal-ai/z-image/turbo/lora", {
    input: {
      prompt,
      negative_prompt:
        "nude, naked, nsfw, bare chest, bare skin, cleavage, revealing outfit, low cut, topless, underwear, lingerie, swimwear, bikini",
      image_size: "square_hd",
      num_inference_steps: 8,
      num_images: 1,
      output_format: "png",
      seed,
      enable_safety_checker: false,
      loras: [
        {
          path: Z_REAL_LORA_URL,
          scale: Z_REAL_LORA_STRENGTH,
        },
      ],
    },
  });

  const data = result.data as { images?: { url: string }[] };
  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) throw new Error("fal returned no image");

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");

  // 검정 이미지 감지: 정상 사진은 최소 50KB 이상, 검정 이미지는 수 KB 수준
  if (buf.byteLength < 50_000) {
    throw new Error(
      `fal returned a blank/black image (${buf.byteLength} bytes)`,
    );
  }

  return {
    image_b64: b64,
    face_seed: seed,
    face_prompt: prompt,
    model: "fal-ai/z-image/turbo/lora",
    lora: Z_REAL_LORA_URL,
  };
}

export async function generateFalCandidates(
  micros: Array<{ prompt: string; seed: number }>,
): Promise<FalCandidateResult[]> {
  if (!FAL_KEY) throw new Error("FAL_KEY is not set");

  fal.config({ credentials: FAL_KEY });

  // 1차 시도
  const round1 = await Promise.allSettled(
    micros.map(({ prompt, seed }) => generateOne(prompt, seed)),
  );

  const candidates: FalCandidateResult[] = round1
    .filter(
      (r): r is PromiseFulfilledResult<FalCandidateResult> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);

  // 실패한 항목만 재시도 (새 seed 사용)
  const failed = round1
    .map((r, i) => (r.status === "rejected" ? micros[i] : null))
    .filter((m): m is { prompt: string; seed: number } => m !== null);

  if (failed.length > 0) {
    await new Promise((r) => setTimeout(r, 1000));
    const round2 = await Promise.allSettled(
      failed.map(({ prompt }) =>
        generateOne(prompt, Math.floor(Math.random() * 2 ** 32)),
      ),
    );
    for (const r of round2) {
      if (r.status === "fulfilled") candidates.push(r.value);
    }
  }

  if (candidates.length === 0) {
    throw new Error("All fal.ai candidate generations failed");
  }

  return candidates;
}
