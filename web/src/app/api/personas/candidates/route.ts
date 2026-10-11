import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  buildMicroPrompts,
  type PersonaPromptParams,
} from "@/lib/personaPrompt";
import {
  buildGeminiPersonaPrompt,
  GEMINI_STYLE_VIBES,
} from "@/lib/personaPromptGemini";
import { generatePersonaImage } from "@/lib/personaImage";
import { generateComfyuiCandidates, isComfyuiAvailable } from "@/lib/comfyui";
import { generateFalCandidates, isFalAvailable } from "@/lib/falPersona";

const FAL_STYLE_VIBES = new Set(["asian_influencer"]);

export const runtime = "nodejs";

const VALID_GENDERS = ["female", "male"];
const VALID_AGE_GROUPS = [
  "early_20s",
  "late_20s",
  "early_30s",
  "late_30s",
  "early_40s",
  "late_40s",
];
const VALID_FACE_TYPES = [
  "dog",
  "cat",
  "fox",
  "rabbit",
  "deer",
  "snake",
  "hamster",
];
const VALID_SKIN_TONES = ["light", "medium", "tan"];
const VALID_FACE_SHAPES = ["oval", "round", "square", "heart"];
const VALID_DOUBLE_EYELIDS = ["double", "mono", "inner"];

export async function POST(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gender = String(body.gender ?? "").trim();
  const age_group = String(body.age_group ?? "").trim();
  const face_type = String(body.face_type ?? "").trim();
  const hair_style = String(body.hair_style ?? "").trim();
  const bang = String(body.bang ?? "random").trim();
  const style_vibe = String(body.style_vibe ?? "").trim();
  const height_cm =
    typeof body.height_cm === "number" ? Math.round(body.height_cm) : 165;
  const body_type =
    typeof body.body_type === "string" ? body.body_type.trim() : "normal";
  const skin_tone =
    typeof body.skin_tone === "string" ? body.skin_tone.trim() : "";
  const face_shape =
    typeof body.face_shape === "string" ? body.face_shape.trim() : "";
  const double_eyelid =
    typeof body.double_eyelid === "string" ? body.double_eyelid.trim() : "";

  if (!VALID_GENDERS.includes(gender))
    return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
  if (!VALID_AGE_GROUPS.includes(age_group))
    return NextResponse.json({ error: "Invalid age_group" }, { status: 400 });
  if (!VALID_FACE_TYPES.includes(face_type))
    return NextResponse.json({ error: "Invalid face_type" }, { status: 400 });
  if (!hair_style || !style_vibe)
    return NextResponse.json(
      { error: "Missing hair_style or style_vibe" },
      { status: 400 },
    );
  if (skin_tone && !VALID_SKIN_TONES.includes(skin_tone))
    return NextResponse.json({ error: "Invalid skin_tone" }, { status: 400 });
  if (face_shape && !VALID_FACE_SHAPES.includes(face_shape))
    return NextResponse.json({ error: "Invalid face_shape" }, { status: 400 });
  if (double_eyelid && !VALID_DOUBLE_EYELIDS.includes(double_eyelid))
    return NextResponse.json(
      { error: "Invalid double_eyelid" },
      { status: 400 },
    );

  const params: PersonaPromptParams = {
    gender,
    age_group,
    face_type,
    hair_style,
    bang,
    style_vibe,
    height_cm,
    body_type,
    ...(skin_tone ? { skin_tone } : {}),
    ...(face_shape ? { face_shape } : {}),
    ...(double_eyelid ? { double_eyelid } : {}),
  };

  try {
    // 원본 로직: style_vibe에 따라 분기
    // 1) k_beauty_standard, k_pop_idol → Gemini 프롬프트 + Gemini 이미지 생성
    // 2) 나머지 + ComfyUI 사용 가능 → ComfyUI 프롬프트 + ComfyUI 이미지 생성
    // 3) 나머지 + ComfyUI 없음 → Gemini 프롬프트로 폴백

    // fal.ai 분기 (asian_influencer)
    if (FAL_STYLE_VIBES.has(style_vibe) && isFalAvailable()) {
      const micros = buildMicroPrompts(params, 4);
      const candidates = await generateFalCandidates(micros);
      return NextResponse.json({ ok: true, candidates });
    }

    if (GEMINI_STYLE_VIBES.has(style_vibe)) {
      // Gemini (Nano Banana) 분기
      const micros = Array.from({ length: 4 }, () => ({
        prompt: buildGeminiPersonaPrompt(params),
        seed: Math.floor(Math.random() * 2 ** 32),
      }));

      const results = await Promise.allSettled(
        micros.map(async ({ prompt, seed }) => {
          const imageB64 = await generatePersonaImage(prompt);
          return {
            ok: true,
            image_b64: imageB64,
            face_seed: seed,
            face_prompt: prompt,
          };
        }),
      );

      const candidates = results
        .filter(
          (
            r,
          ): r is PromiseFulfilledResult<{
            ok: true;
            image_b64: string;
            face_seed: number;
            face_prompt: string;
          }> => r.status === "fulfilled",
        )
        .map((r) => r.value);

      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "All Gemini candidate generations failed" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, candidates });
    }

    // ComfyUI 필수 — 없으면 에러
    if (!isComfyuiAvailable()) {
      return NextResponse.json(
        {
          error:
            "ComfyUI가 설정되지 않았습니다. COMFYUI_CHECKPOINT를 .env.local에 설정하세요.",
        },
        { status: 503 },
      );
    }

    const micros = buildMicroPrompts(params, 4);
    const candidates = await generateComfyuiCandidates(micros, style_vibe);
    return NextResponse.json({ ok: true, candidates });
  } catch (e) {
    const detail =
      e instanceof Error ? e.message : "Candidate generation failed";
    const status = /ComfyUI.*not set|not running/i.test(detail) ? 503 : 500;
    return NextResponse.json({ error: detail }, { status });
  }
}
