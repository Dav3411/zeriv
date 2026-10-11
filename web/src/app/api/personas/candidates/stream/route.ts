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
import {
  submitWorkflow,
  waitForJob,
  fetchImage,
  buildComfyuiWorkflow,
  isComfyuiAvailable,
} from "@/lib/comfyui";
import { fal } from "@fal-ai/client";
import { generateOne, isFalAvailable } from "@/lib/falPersona";

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (
        index: number,
        candidate: object | null,
        error?: string,
      ) => {
        const line = JSON.stringify({ index, candidate, error }) + "\n";
        controller.enqueue(encoder.encode(line));
      };

      try {
        // fal.ai 분기 (asian_influencer) — 개별 Promise로 완료 즉시 스트리밍
        if (FAL_STYLE_VIBES.has(style_vibe) && isFalAvailable()) {
          fal.config({ credentials: process.env.FAL_KEY ?? "" });
          const micros = buildMicroPrompts(params, 4);

          const promises = micros.map(async ({ prompt, seed }, index) => {
            // 요청 시작을 300ms씩 엇갈려 rate limit 회피
            if (index > 0) {
              await new Promise((r) => setTimeout(r, index * 300));
            }
            // 1차 시도
            try {
              const candidate = await generateOne(prompt, seed);
              send(index, candidate);
              return;
            } catch {
              // 1초 딜레이 후 재시도
            }
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const candidate = await generateOne(
                prompt,
                Math.floor(Math.random() * 2 ** 32),
              );
              send(index, candidate);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              send(index, null, msg);
            }
          });

          await Promise.allSettled(promises);
          controller.close();
          return;
        }

        // Gemini 분기 — 4개 개별 Promise, 완료 순서대로 스트리밍
        if (GEMINI_STYLE_VIBES.has(style_vibe)) {
          const micros = Array.from({ length: 4 }, (_, i) => ({
            index: i,
            prompt: buildGeminiPersonaPrompt(params),
            seed: Math.floor(Math.random() * 2 ** 32),
          }));

          const promises = micros.map(async ({ index, prompt, seed }) => {
            try {
              const imageB64 = await generatePersonaImage(prompt);
              send(index, {
                ok: true,
                image_b64: imageB64,
                face_seed: seed,
                face_prompt: prompt,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              send(index, null, msg);
            }
          });

          await Promise.allSettled(promises);
          controller.close();
          return;
        }

        // ComfyUI 분기
        if (!isComfyuiAvailable()) {
          const errLine =
            JSON.stringify({
              error:
                "ComfyUI가 설정되지 않았습니다. COMFYUI_CHECKPOINT를 .env.local에 설정하세요.",
            }) + "\n";
          controller.enqueue(encoder.encode(errLine));
          controller.close();
          return;
        }

        const micros = buildMicroPrompts(params, 4);
        const COMFYUI_CHECKPOINT = process.env.COMFYUI_CHECKPOINT ?? "";
        const COMFYUI_ZIT_CHECKPOINT = process.env.COMFYUI_ZIT_CHECKPOINT ?? "";
        const COMFYUI_ZIT_LORA = process.env.COMFYUI_ZIT_LORA ?? "";
        const isZit =
          style_vibe === "asian_influencer" && !!COMFYUI_ZIT_CHECKPOINT;
        const ckpt = isZit ? COMFYUI_ZIT_CHECKPOINT : COMFYUI_CHECKPOINT;
        const loraValue = isZit
          ? COMFYUI_ZIT_LORA
          : (process.env.COMFYUI_LORA ?? "");

        // Step 1: 4개 workflow 모두 submit
        const submitResults = await Promise.allSettled(
          micros.map(({ prompt, seed }) =>
            submitWorkflow(buildComfyuiWorkflow(prompt, seed, style_vibe)),
          ),
        );

        // Step 2: 성공한 job에 대해 waitForJob + fetchImage를 개별 Promise로 처리
        const jobPromises = submitResults.map(async (submitResult, index) => {
          if (submitResult.status === "rejected") {
            const msg =
              submitResult.reason instanceof Error
                ? submitResult.reason.message
                : String(submitResult.reason);
            send(index, null, `ComfyUI submit failed: ${msg}`);
            return;
          }

          const promptId = submitResult.value;
          try {
            const outputs = await waitForJob(promptId);
            const pngBytes = await fetchImage(outputs, promptId);
            send(index, {
              image_b64: pngBytes.toString("base64"),
              face_seed: micros[index].seed,
              face_prompt: micros[index].prompt,
              model: ckpt,
              lora: loraValue || null,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            send(index, null, msg);
          }
        });

        await Promise.allSettled(jobPromises);
        controller.close();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Candidate generation failed";
        const errLine = JSON.stringify({ error: msg }) + "\n";
        controller.enqueue(encoder.encode(errLine));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
