import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import { applyWatermarkIfNeeded } from "./watermark.mjs";
import { getPatternsFor, getPatternByKey } from "./quickPatterns.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(webRoot, ".env.local"), override: true });

function getEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

const supabaseUrl = getEnv("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const secretKey = getEnv("SUPABASE_SECRET_KEY");
const generatorBaseUrl = process.env.GENERATOR_BASE_URL ?? "http://127.0.0.1:8787";
const jobSource = process.env.JOB_SOURCE || "production";
const WORKER_CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || "1") || 1);

const r2Endpoint = getEnv("R2_ENDPOINT");
const r2AccessKeyId = getEnv("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
const r2Bucket = getEnv("R2_BUCKET");
const r2PublicUrl = (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

function toR2PublicUrl(keyOrUrl) {
  if (!keyOrUrl) return null;
  if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) return keyOrUrl;
  if (!r2PublicUrl) return null;
  return `${r2PublicUrl}/${keyOrUrl}`;
}

const supabase = createClient(supabaseUrl, secretKey);
const r2 = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
});

// ---------------------------------------------------------------------------
// Aspect ratio helper
// ---------------------------------------------------------------------------
function getGeminiAspectRatio(aspectRatio) {
  const map = { "1:1": "1:1", "3:4": "3:4", "4:3": "4:3", "4:5": "3:4", "9:16": "9:16", "16:9": "16:9" };
  return map[aspectRatio] ?? "1:1";
}

// ---------------------------------------------------------------------------
// Gemini — 9-pose face sheet generation
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";

let _faceSheetTemplateB64 = null;

async function loadFaceSheetTemplate() {
  if (_faceSheetTemplateB64) return _faceSheetTemplateB64;
  const templatePath = path.join(webRoot, "public", "sheet", "face_sheet.png");
  const buf = await fs.readFile(templatePath);
  _faceSheetTemplateB64 = buf.toString("base64");
  return _faceSheetTemplateB64;
}

const FACE_SHEET_PROMPT = `Use image 1 only as the 9-view head pose template.
Use image 2 only as the subject identity reference.

Create a single 3x3 head pose sheet. Apply the person from image 2 to all nine poses from image 1.

Preserve the exact facial identity, face shape, hairstyle, hair length, hair texture, hair color, bangs, eyes, nose, lips, skin tone, and overall appearance from image 2 with high fidelity. Do not copy the facial features, head shape, or identity from image 1.

All 9 panels must depict the exact same person. Maintain full identity consistency across every panel, as if the same individual is photographed from nine different viewing angles. Do not generate variations, alternate versions, or slightly different faces. The subject must remain unmistakably the same person in all nine images.

Follow the head orientation, viewing direction, and composition of each panel in image 1 exactly.

Top row:
1) looking up-left
2) looking straight up
3) looking up-right

Middle row:
4) looking left
5) looking straight forward
6) looking right

Bottom row:
7) looking down-left
8) looking straight down
9) looking down-right

Output requirements:
- one single image sheet, 3 columns by 3 rows
- all 9 panels evenly aligned and clearly separated
- consistent identity across all 9 panels
- all 9 images must look like the same exact person
- same hairstyle and facial structure in every panel
- clean head study / character head pose sheet presentation
- solid green background in every panel
- no body, no shoulders, no torso, no clothing visible
- head only
- neutral expression
- no extra accessories unless present in image 2
- natural anatomy and realistic head proportions
- high detail, clean rendering, consistent lighting across all panels

Important:
Image 1 provides only the head pose directions and sheet layout.
Image 2 provides only the person's identity, facial features, face shape, and hairstyle.
Do not blend the identity of image 1 with image 2.
Do not create different face variations across panels.
The final sheet must read as one unified identity shown in nine directions.`;

/**
 * Gemini를 사용하여 9구도 페이스 시트를 생성한다.
 * @param {string} faceImageB64 - 캐릭터 얼굴 이미지 (base64)
 * @returns {Promise<Buffer|null>} - 생성된 페이스 시트 PNG Buffer, 실패 시 null
 */
async function generateFaceSheet(faceImageB64) {
  if (!GEMINI_API_KEY) {
    console.warn("[FaceSheet] GEMINI_API_KEY not set, skipping face sheet generation");
    return null;
  }

  const templateB64 = await loadFaceSheetTemplate();
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  return await withRetry(async () => {
    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: templateB64 } },
              { inlineData: { mimeType: "image/png", data: faceImageB64 } },
              { text: FACE_SHEET_PROMPT },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { imageSize: "4K" },
        },
      }),
      180_000,
      "Gemini generateContent (FaceSheet)"
    );

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const data = part.inlineData?.data;
      if (typeof data === "string" && data.length > 0) {
        return Buffer.from(data, "base64");
      }
    }
    // 응답은 200이지만 이미지가 비어있는 경우 — 재시도 가치 있음
    const err = new Error("Gemini returned no face sheet image");
    err.status = 502;
    throw err;
  }, 5, 5000, 30000);
}

// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Promise에 timeout을 걸어 초과 시 Error를 throw한다.
 * AbortError 이름을 사용하므로 withRetry가 재시도 없이 즉시 throw한다.
 */
function withTimeout(promise, ms, label = "operation") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timeout after ${ms}ms`);
      err.name = "AbortError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function withRetry(fn, maxAttempts = 3, baseDelayMs = 2000, maxDelayMs = 30000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      // AbortError(사용자 취소·타임아웃 제어 등) 및 TimeoutError(AbortSignal.timeout)는 retry 대상 아님 — 즉시 throw
      if (e?.name === "AbortError" || e?.name === "TimeoutError") throw e;

      const status = e?.status ?? e?.response?.status;
      const msg = String(e?.message ?? "");
      const isRetryableStatus = status === 429 || status === 408 || (status >= 500 && status < 600);
      const isRetryableMessage = /UNAVAILABLE|RESOURCE_EXHAUSTED|deadline|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg);
      const isRetryable = isRetryableStatus || isRetryableMessage;

      // status가 없는 에러(네트워크 단절, 알 수 없는 던지기 등)는 retry 대상으로 본다.
      // fetch failed / ECONNRESET 등은 isRetryableMessage로 잡히고,
      // 그 외 status도 메시지도 매칭 안 되는 에러는 의도적으로 maxAttempts까지 재시도해
      // 일시적 인프라 이슈를 흡수한다. 무한 루프는 maxAttempts 캡으로 방지된다.
      // 명백한 4xx 클라이언트 오류 (400/401/403/404 등)는 즉시 throw
      if (!isRetryable && status >= 400 && status < 500) throw e;
      if (i === maxAttempts - 1) throw e;

      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(1.5, i)) + Math.random() * 500;
      await sleep(delay);
    }
  }
}

/** 재배포/크래시 등으로 오래 동안 processing 상태인 잡을 다시 queued로 되돌림. */
async function requeueStaleProcessingJobs() {
  const minutes = Math.max(1, Number(process.env.WORKER_STALE_PROCESSING_MINUTES ?? "15") || 15);
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("jobs")
    .select("id")
    .eq("status", "processing")
    .lt("started_at", cutoff);
  if (!stale?.length) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("jobs")
    .update({ status: "queued", progress: 0, started_at: null, requeued_at: now, updated_at: now })
    .in("id", stale.map((r) => r.id));
  if (error) {
    console.warn("requeueStaleProcessingJobs failed:", error.message);
    return;
  }
  console.log(`Requeued ${stale.length} stale processing job(s) (older than ${minutes} min)`);
}

async function claimJob() {
  // FOR UPDATE SKIP LOCKED: 다중 워커 환경에서 race condition 없이 원자적으로 job claim
  const { data, error } = await supabase
    .rpc("claim_next_job", { p_source: jobSource })
    .maybeSingle();
  if (error) {
    console.error("claimJob error:", error);
    return null;
  }
  return data ?? null;
}

async function markJobFailed(jobId, message, creditLedgerId = null) {
  const now = new Date().toISOString();
  await supabase
    .from("jobs")
    .update({ status: "failed", error: message, updated_at: now })
    .eq("id", jobId);

  if (creditLedgerId) {
    await supabase.rpc("release_job_credits", { p_ledger_id: creditLedgerId });
  }
}

/** Generator API 오류 시 응답 body/status에서 저장할 메시지 추출 (Supabase job.error용). */
function generatorErrorMessage(res, body, fallback = "Generator failed") {
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length)
    return detail.map((d) => (typeof d === "object" && d?.msg ? d.msg : String(d))).join("; ") || fallback;
  if (res && !res.ok) return `Generator ${res.status} ${(res.statusText || "").trim()}`.trim() || fallback;
  return fallback;
}

async function processModelJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const name = String(payload.name ?? "").trim();
  const gender = String(payload.gender ?? "").trim();
  const age_group = String(payload.age_group ?? "").trim();
  const face_type = String(payload.face_type ?? "").trim();
  const hair_style = String(payload.hair_style ?? "").trim();
  const style_vibe = String(payload.style_vibe ?? "").trim();
  const height_cm = Number(payload.height_cm ?? 0);
  const body_type = String(payload.body_type ?? "normal").trim();

  if (!name || !gender || !age_group || !face_type || !hair_style || !style_vibe) {
    throw new Error("Missing model payload fields");
  }

  await updateJob({ progress: 10 });

  // 미리보기에서 선택된 이미지가 payload에 포함된 경우 → 재생성 없이 바로 사용.
  // 신규 경로: create-job에서 R2에 미리 업로드한 뒤 key만 payload에 담는다 (preview_image_key).
  // 레거시 경로: 과거 버전이 인큐한 job은 여전히 image_b64를 담고 있을 수 있어 호환성 유지.
  // R2 다운로드 실패 시엔 재생성 경로로 fallback한다 (preview 없음과 동일하게 처리).
  let previewImageB64 = null;
  if (typeof payload.preview_image_key === "string" && payload.preview_image_key.length > 0) {
    try {
      const buf = await downloadR2(payload.preview_image_key);
      previewImageB64 = buf.toString("base64");
    } catch (e) {
      console.error(`[Model] Failed to download preview image from R2 (key=${payload.preview_image_key}):`, e);
      previewImageB64 = null;
    }
  } else if (typeof payload.image_b64 === "string" && payload.image_b64.length > 0) {
    previewImageB64 = payload.image_b64;
  }
  const loraConfig = payload.lora_config && typeof payload.lora_config === "object"
    ? payload.lora_config : null;

  let modelData;
  if (previewImageB64) {
    console.log("[Model] Using pre-generated preview image for:", name);
    modelData = {
      image_b64: previewImageB64,
      face_seed: payload.face_seed ?? null,
      face_prompt: payload.face_prompt ?? null,
    };
    await updateJob({ progress: 50 });
  } else {
    // Generate model image directly via Gemini (no external Python server needed)
    console.log("[Model] Generating image via Gemini API for:", name);

    const previewRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/personas/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secretKey}` },
      body: JSON.stringify({ name, gender, age_group, face_type, hair_style, style_vibe, height_cm, body_type }),
      signal: AbortSignal.timeout(30_000),
    });

    const previewData = await previewRes.json().catch(() => null);
    const preview = previewData?.previews?.[0];
    if (!preview?.ok || !preview?.image_b64) {
      throw new Error(`Model image generation failed: ${preview?.error ?? "unknown error"}`);
    }

    await updateJob({ progress: 50 });
    modelData = {
      image_b64: preview.image_b64,
      face_seed: preview.face_seed ?? null,
      face_prompt: preview.face_prompt ?? null,
    };
  }

  // Upload image to R2
  let imageKey = null;
  const imageB64 = modelData.image_b64 ?? null;
  if (imageB64) {
    try {
      const imageBuffer = Buffer.from(imageB64, "base64");
      imageKey = `personas/${job.user_id}/${crypto.randomUUID()}.png`;
      await r2.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: imageKey,
          Body: imageBuffer,
          ContentType: "image/png",
        })
      );
      console.log(`[Model ${name}] Image uploaded to R2: ${imageKey}`);
    } catch (e) {
      console.error(`[Model ${name}] Failed to upload image:`, e);
      imageKey = null;
    }
  }

  await updateJob({ progress: 60 });

  // 9구도 페이스 시트 생성 (Gemini) — 실패해도 모델 생성은 계속 진행
  let faceSheetKey = null;
  if (imageB64) {
    try {
      console.log(`[Model ${name}] Generating 9-pose face sheet...`);
      await updateJob({ progress: 70 });
      const faceSheetBuffer = await generateFaceSheet(imageB64);
      if (faceSheetBuffer) {
        faceSheetKey = `personas/${job.user_id}/${crypto.randomUUID()}_face_sheet.png`;
        await r2.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: faceSheetKey,
            Body: faceSheetBuffer,
            ContentType: "image/png",
          })
        );
        console.log(`[Model ${name}] Face sheet uploaded to R2: ${faceSheetKey}`);
      } else {
        console.warn(`[Model ${name}] Gemini returned no face sheet image`);
      }
    } catch (e) {
      const status = e?.status ?? e?.response?.status ?? "n/a";
      const apiCode = e?.error?.code ?? e?.cause?.error?.code ?? "n/a";
      console.error(
        `[Model ${name}] Face sheet generation failed (non-fatal) — job=${job.id}, user=${job.user_id}, status=${status}, code=${apiCode}, msg=${String(e?.message ?? "").slice(0, 200)}`
      );
      faceSheetKey = null;
    }
  }

  await updateJob({ progress: 80 });

  // brand_id 결정: payload 에 brand_id 가 있으면 검증 후 그대로 사용.
  // worker 단에서 brand_id 까지 INSERT 해야 클라이언트가 폴링 도중 페이지를
  // 이탈해도 모델이 브랜드에 정상 연결된다. 잘못된 brand_id 가 넘어오면(소유권 불일치 등)
  // brand_id 없이 INSERT 하여 모델 자체는 살아 있게 한다 (사용자가 추후 수동 연결 가능).
  let brandIdForInsert = null;
  const payloadBrandId = typeof payload.brand_id === "string" && payload.brand_id.length > 0
    ? payload.brand_id
    : null;
  if (payloadBrandId) {
    try {
      const { data: brandRow } = await supabase
        .from("brands")
        .select("id")
        .eq("id", payloadBrandId)
        .eq("user_id", job.user_id)
        .maybeSingle();
      if (brandRow?.id) {
        brandIdForInsert = brandRow.id;
      } else {
        console.warn(`[Model ${name}] brand_id ${payloadBrandId} not owned by user ${job.user_id}; inserting without brand_id`);
      }
    } catch (e) {
      console.error(`[Model ${name}] Failed to verify brand ownership for ${payloadBrandId}:`, e);
    }
  }

  // face_master_key에 R2 key를 저장 (API에서 signed URL로 변환)
  const { data: inserted, error: insertErr } = await supabase
    .from("models")
    .insert({
      user_id: job.user_id,
      name,
      selections: { gender, age_group, face_type, hair_style, style_vibe, height_cm, body_type },
      face_master_key: imageKey,
      face_sheet_key: faceSheetKey,
      generation_seed: modelData.face_seed ?? null,
      generation_prompt: modelData.face_prompt ?? null,
      ...(brandIdForInsert ? { brand_id: brandIdForInsert } : {}),
      ...(loraConfig ? { lora_config: loraConfig } : {}),
      status: "done",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    const message = insertErr?.message || insertErr?.details || "Unknown error";
    throw new Error(`Failed to insert model: ${message}`);
  }

  if (job.credit_ledger_id) {
    await supabase.rpc("capture_job_credits", { p_ledger_id: job.credit_ledger_id });
  }

  await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      progress: 100,
      result: {
        type: "persona",
        model_id: inserted.id,
      },
      updated_at: nowIso(),
    })
    .eq("id", job.id);
}

// ---------------------------------------------------------------------------
// Render job — 3-step AI pipeline
// ---------------------------------------------------------------------------

const MANNEQUIN_PROMPT = `Pose preservation is the highest priority. The white 3D figure must hold the exact same pose as the original person in image 1. Do not change the pose. Do not straighten the body. Do not default to a standing pose. Copy every joint angle, limb position, head tilt, shoulder rotation, arm bend, leg position, and body lean exactly from image 1.

Use image 1 only as the scene, background, pose, framing, camera angle, subject placement, crop, lighting reference, and emotional reference.
Use image 2 only as the white 3D figure style reference.

Keep the entire background and environment from image 1 unchanged.
Replace only the person in image 1 with a smooth white 3D human figure in the style of image 2.

Pose rules (critical):
- copy the exact body pose from image 1
- copy the exact arm positions from image 1
- copy the exact leg positions from image 1
- copy the exact head tilt and angle from image 1
- copy the exact shoulder angle from image 1
- copy the exact hand positions from image 1
- copy the exact torso lean and twist from image 1
- if the person is sitting, the figure must be sitting
- if the person is leaning, the figure must be leaning
- if the person is crouching, the figure must be crouching
- do not create a default standing pose
- do not straighten limbs that are bent in image 1
- do not change any joint angle

Preserve from image 1:
- the exact background
- the exact environment
- the exact composition
- the exact framing and crop
- the exact camera angle and perspective
- the exact body pose (most important)
- the exact subject position and scale
- the original body attitude
- the original head angle
- the original gaze direction

Apply from image 2:
- smooth white 3D figure appearance
- clean matte white material
- simplified anatomy style
- consistent 3D shading on the body

Skin requirements:
- the entire body must be solid matte white
- all exposed areas must be white, not human skin
- arms, legs, hands, feet, neck, face — all white
- no human skin color anywhere
- no flesh-colored areas
- uniform white 3D model from head to toe

Clothing requirements:
- the figure must wear a plain white T-shirt
- the figure must wear plain white shorts
- both garments should be clean, simple, and minimal
- no logos, no prints, no text, no patterns, no accessories

Head requirements:
- completely bald, no hair of any kind
- no hair on top, sides, back of the head
- no hair on neck or shoulders
- the head must be completely smooth
- simplified white face with no realistic features
- no realistic eyebrows, eyelashes, lips, or skin texture

Lighting integration is critical.
The white 3D figure must inherit the exact lighting logic of image 1.
Match light direction, softness, shadows, highlights, exposure, white balance, color temperature, and ambient light from image 1.
The figure must look naturally present in the original scene, not separately rendered or pasted.

Important:
Only change the person. Do not change the background, environment, crop, framing, or subject scale.
Do not turn the whole image into 3D. Only the person becomes a white 3D figure.
The scene must remain photographic and unchanged.
The pose must match image 1 exactly.

Output requirements:
- same scene as image 1
- same pose as image 1 (critical)
- same crop and composition as image 1
- background fully preserved
- person fully replaced by a smooth white 3D figure
- plain white T-shirt and plain white shorts
- completely bald smooth white head
- no hair anywhere
- no realistic face or skin
- clean white 3D model appearance
- natural lighting integration into the original scene`;

const FINAL_COMPOSITE_PROMPT = `The subject must wear the exact clothing from image 3. Do not keep the white placeholder clothing from image 1. The clothing from image 3 must be applied with full detail, color, pattern, and design fidelity.

Use image 1 only as the scene, background, pose, composition, camera angle, subject placement, subject scale, framing, crop, lighting reference, expression reference, emotional reference, and face-to-body proportion reference. The clothing in image 1 is a placeholder — ignore it and use image 3 instead.
Use image 2 only as the face, head, hairstyle, and identity-feature reference sheet.
Use image 3 only as the clothing reference sheet (contains the actual garments the subject must wear).

Replace only the person in image 1.

Keep everything else from image 1 unchanged:
- same background
- same environment
- same scene
- same pose
- same framing
- same crop
- same camera angle
- same perspective
- same lighting setup
- same subject placement
- same visible body extent

Treat the person in image 1 as a pose, expression, proportion, and scene placeholder only.
Do not preserve the original identity from image 1.
Do not preserve the original face identity from image 1.
Do not preserve the original hairstyle from image 1.
Do not preserve the original clothing from image 1.
Do not preserve the original skin tone or facial identity from image 1.

The final subject must use:
- face, head shape, facial features, hairstyle, hair color, hair texture, bangs, and overall identity from image 2
- exact clothing (both top and bottom garments) from image 3
- facial expression and emotional tone from image 1
- face-to-body proportion from image 1

Preserve the face from image 2 with high fidelity:
- exact facial identity
- exact face shape
- exact jawline
- exact cheek shape
- exact eye shape
- exact nose shape
- exact lips
- exact eyebrow shape
- exact bangs
- exact hairstyle
- exact hair length
- exact hair color
- exact hair texture
- exact hairline
- exact skin tone
- exact overall appearance

Use image 2 only as an identity-feature reference sheet, not as a literal cutout source.
Do not copy, paste, transplant, collage, or overlay any individual face panel from image 2 into the final image.
Do not select the nearest face panel from image 2 and paste it into the output.
Do not preserve cropped boundaries, hard cut lines, truncated hair silhouettes, or patch-like face edges from image 2.

Reconstruct a new face and head for the subject in image 1 using the identity cues from image 2:
- same person
- same facial identity
- same face shape
- same eye shape
- same nose shape
- same lips
- same bangs
- same hairstyle
- same hair color
- same overall appearance

The face must be newly synthesized to fit the exact pose, expression, perspective, crop, and body position of image 1.
Do not blend the facial identity of image 2 with the facial identity of image 1.
Do not average the faces.
Do not create a similar-looking new person.
Do not keep any residual facial identity from image 1.

Hair continuity is critical.
Reconstruct the full hairstyle naturally so that the hair connects continuously to the scalp, head shape, neck, and shoulders.
Do not copy the cropped hair boundary from image 2.
Do not preserve hard cut edges from the face sheet.
Do not generate chopped hair ends, pasted hair sections, floating hair blocks, collage-like edges, or straight cut patch boundaries.
The final hair must look naturally photographed and fully connected to the subject in image 1.

Expression and emotion are critical.
Preserve the exact facial expression, emotional tone, mood, gaze feeling, and facial tension from image 1.
The final subject must keep the same expression logic as the original subject in image 1, while replacing only the identity with image 2.
Keep the same emotional impression from image 1:
- same eye openness
- same mouth expression
- same facial tension or softness
- same emotional mood
- same head attitude
- same gaze mood
Do not neutralize the expression.
Do not replace the original emotion with a generic calm face.
Do not change the emotional tone unless required for natural face reconstruction.

Preserve the face-to-body proportion from image 1:
- same head size relative to the body
- same face-to-body balance
- same neck-to-head proportion
- same shoulder-to-head proportion
- same visible upper-body to head proportion
Do not enlarge or shrink the head unnaturally.
Do not reinterpret the anatomy with a different head-to-body ratio.
Keep the same overall proportion impression as image 1.
The final head, neck, and shoulders must read as one continuous photographed subject.

Clothing is critical. The subject must wear the exact clothing shown in image 3.
Do not keep the white T-shirt from image 1.
Do not keep the white shorts from image 1.
Do not use any clothing from image 1.
The clothing in image 1 is a placeholder and must be fully replaced with the clothing from image 3.
If image 3 shows a jacket, the subject must wear that exact jacket.
If image 3 shows jeans, the subject must wear those exact jeans.
If image 3 shows a dress, the subject must wear that exact dress.
Look at every garment in image 3 and apply it to the subject.

Preserve the clothing from image 3 with high fidelity:
- exact garments (top and bottom) from image 3
- exact clothing colors — do not change any color
- exact garment silhouette — do not simplify the shape
- exact material appearance — fabric texture, sheen, weight
- exact seams, stitching, and construction details
- exact collar shape, sleeve length, and hem line
- exact pocket placement and shape
- exact button or zipper placement
- exact logo placement, size, and design
- exact print placement, scale, layout, and colors
- exact text placement if visible
- exact pattern (stripes, checks, florals, etc.) if present
- exact embroidery or decorative elements if present

Treat clothing graphics, logos, prints, and patterns as fixed surface graphics.
Do not rewrite, simplify, paraphrase, restyle, resize, relocate, or replace any logo, print, pattern, or text element.
Do not invent new graphics or patterns.
Do not make the clothing plainer or simpler than it appears in image 3.
Do not merge multiple garments into one.
If image 3 shows separate top and bottom garments, the subject must wear both as separate pieces.

Lighting integration is critical.
The replaced person must be re-lit to match the exact lighting conditions of image 1 so that the subject looks naturally captured in the original space.

Match the new subject to the lighting of image 1 in all of the following:
- same light direction
- same light softness or hardness
- same exposure level
- same brightness balance
- same white balance
- same color temperature
- same contrast level
- same shadow direction
- same shadow softness
- same shadow intensity
- same highlight intensity
- same ambient light level
- same environmental bounce light
- same reflected light from nearby surfaces
- same color spill from the environment
- same photographic mood

The subject must appear physically present in the space of image 1.
Add realistic contact shadows, occlusion, and depth cues where needed so the person feels grounded in the scene.
Match the subject to the same photographic realism as image 1, including the same softness or sharpness balance, the same noise or grain behavior if present, and the same scene atmosphere.

Do not use generic portrait lighting.
Do not use default studio lighting.
Do not use separate subject lighting that ignores the environment.
Relight the person strictly according to the lighting evidence present in image 1.

Important scene rule:
Only replace the person.
Do not alter the background or environment.
Do not expand the framing.
Do not zoom out.
Do not uncrop the scene.
Do not reveal more of the body than image 1 shows.
If parts of the body are cropped out in image 1, they must remain cropped out in the final image.
Preserve the exact crop, subject scale, and visible body range from image 1.

Important identity rule:
The final result must depict one unified person.
The face and hair must clearly and unmistakably match image 2.
The expression and emotional tone must match image 1.
The face-to-body proportion must match image 1.
The clothing (top and bottom) must match image 3.
The scene, pose, framing, crop, and lighting must match image 1.

Output requirements:
- one single realistic image
- same scene as image 1
- same pose and composition as image 1
- same crop and subject scale as image 1
- face and hair from image 2
- expression and emotion from image 1
- face-to-body proportion from image 1
- clothing (top and bottom) from image 3
- natural anatomy
- believable proportions
- realistic integration into the scene
- natural lighting integration into the original environment
- consistent shadows and reflections
- high detail
- photorealistic result

Summary:
Image 1 provides the scene, pose, framing, crop, lighting, expression, emotional tone, and face-to-body proportion.
Image 2 provides the face, head, hair identity, and multi-angle identity cues only.
Image 3 provides the clothing reference sheet (both top and bottom garments).
Keep everything in image 1 unchanged except the person, and replace that person using image 2 and image 3, while preserving the original expression, emotional tone, face-to-body proportion, and scene lighting from image 1.`;

/** R2에서 이미지 다운로드 → Buffer (AWS SDK v3 abortSignal 지원) */
async function downloadR2(key, timeoutMs = 60_000) {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(new Error(`R2 download timeout after ${timeoutMs}ms: ${key}`)),
    timeoutMs
  );
  try {
    const resp = await r2.send(
      new GetObjectCommand({ Bucket: r2Bucket, Key: key }),
      { abortSignal: ac.signal }
    );
    const chunks = [];
    for await (const chunk of resp.Body) {
      if (ac.signal.aborted) throw ac.signal.reason ?? new Error("R2 download aborted");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

/** 이미지 버퍼를 API 전송용으로 리사이즈 (maxDim 초과 시 JPEG으로 변환) */
async function resizeForApi(buf, maxDim = 1024) {
  const { default: sharpMod } = await import("sharp");
  const meta = await sharpMod(buf).metadata();
  if ((meta.width ?? 0) <= maxDim && (meta.height ?? 0) <= maxDim) return buf;
  return sharpMod(buf).resize(maxDim, maxDim, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
}


/** sharp로 1-9장의 이미지를 4K 시트로 합성 */
async function createImageSheet(imageBuffers) {
  const sharp = (await import("sharp")).default;
  const sheetSize = 4096;
  const count = imageBuffers.length;

  // 레이아웃 결정 (1-9장)
  let cols, rows;
  if (count === 1) { cols = 1; rows = 1; }
  else if (count === 2) { cols = 2; rows = 1; }
  else if (count <= 4) { cols = 2; rows = 2; }
  else if (count <= 6) { cols = 3; rows = 2; }
  else { cols = 3; rows = 3; }

  const cellW = Math.floor(sheetSize / cols);
  const cellH = Math.floor(sheetSize / rows);

  const composites = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // 3장일 때 마지막 이미지는 하단 중앙
    let x = col * cellW;
    const y = row * cellH;
    if (count === 3 && i === 2) {
      x = Math.floor((sheetSize - cellW) / 2);
    }
    const resized = await sharp(imageBuffers[i])
      .resize(cellW, cellH, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    composites.push({ input: resized, left: x, top: y });
  }

  return sharp({
    create: { width: sheetSize, height: sheetSize, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/* [DISABLED - dance legacy]
async function processRenderJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const exampleKey = payload.reference_image_key ?? payload.example_image_key;
  const outfitKeys = payload.outfit_image_keys ?? payload.top_image_keys ?? [];
  // 하위 호환: 기존 top+bottom 잡도 처리
  if (!outfitKeys.length && payload.bottom_image_keys?.length) {
    outfitKeys.push(...payload.bottom_image_keys);
  }
  const faceSheetKey = payload.face_sheet_key;

  if (!exampleKey || !outfitKeys.length || !faceSheetKey) {
    throw new Error("Missing render payload fields");
  }

  await updateJob({ progress: 5 });
  console.log(`[Render] Starting render job ${job.id}`);

  // ── Step 1 + Step 2 병렬 실행 ────────────────────────────────────────
  await updateJob({ progress: 10 });

  const [mannequinBuffer, outfitSheetBuffer] = await Promise.all([
    // Step 1: Gemini — 마네킹 변환
    (async () => {
      console.log("[Render] Step 1: Mannequin conversion via Gemini...");

      if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

      const exampleBuf = await downloadR2(exampleKey);
      const bodySheetBuf = await fs.readFile(path.join(webRoot, "public", "sheet", "body_sheet.png"));

      const ai1 = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      return await withRetry(async () => {
        console.log(`[Render] Step 1: calling ${GEMINI_IMAGE_MODEL}...`);
        const response = await withTimeout(
          ai1.models.generateContent({
            model: GEMINI_IMAGE_MODEL,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "image/png", data: exampleBuf.toString("base64") } },
                  { inlineData: { mimeType: "image/png", data: bodySheetBuf.toString("base64") } },
                  { text: MANNEQUIN_PROMPT },
                ],
              },
            ],
            config: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: { imageSize: "2K" },
            },
          }),
          180_000,
          "Gemini generateContent (Render Step1 Mannequin)"
        );

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          const data = part.inlineData?.data;
          if (typeof data === "string" && data.length > 0) {
            return Buffer.from(data, "base64");
          }
        }
        console.warn(`[Render] Step 1: no image in response`);
        const err = new Error("Gemini returned no mannequin image");
        err.status = 502;
        throw err;
      });
    })(),

    // Step 2: 의상 시트 (4K, 최대 9장)
    (async () => {
      console.log(`[Render] Step 2: Outfit sheet (${outfitKeys.length} images)...`);
      const buffers = await Promise.all(outfitKeys.map((k) => downloadR2(k)));
      return createImageSheet(buffers);
    })(),
  ]);

  await updateJob({ progress: 50 });
  console.log("[Render] Steps 1, 2 complete.");

  // 중간결과물 R2 저장 (마네킹 + 의상 시트)
  const influencerId = payload.influencer_id ?? job.user_id;
  const mannequinKey = `render/${influencerId}/${job.id}_mannequin.png`;
  const outfitSheetKey = `render/${influencerId}/${job.id}_outfit_sheet.png`;
  await Promise.all([
    r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: mannequinKey, Body: mannequinBuffer, ContentType: "image/png" })),
    r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: outfitSheetKey, Body: outfitSheetBuffer, ContentType: "image/png" })),
  ]);
  console.log("[Render] Intermediate results uploaded to R2.");

  // ── Step 2.5: Brand profile style hint ──────────────────────────────
  const brandHint = await fetchBrandProfileStyleHint(payload.profile_id);
  if (brandHint) console.log(`[Render] Brand profile hint applied (${brandHint.length} chars)`);

  // ── Step 3: Gemini 최종 합성 ───────────────────────────────────────────
  await updateJob({ progress: 60 });
  console.log("[Render] Step 3: Final composite via Gemini...");

  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  // step 2에서 이미 메모리에 있는 버퍼를 재사용 — R2 재다운로드 불필요
  const faceSheetBuf = await downloadR2(faceSheetKey);
  const mannequinBuf = mannequinBuffer;
  const outfitSheetBuf = outfitSheetBuffer;

  const compositePrompt = FINAL_COMPOSITE_PROMPT + brandHint;
  const ai3 = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const resultBuffer = await withRetry(async () => {
    console.log(`[Render] Step 3: calling ${GEMINI_IMAGE_MODEL}...`);
    const response = await withTimeout(
      ai3.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: mannequinBuf.toString("base64") } },
              { inlineData: { mimeType: "image/png", data: faceSheetBuf.toString("base64") } },
              { inlineData: { mimeType: "image/png", data: outfitSheetBuf.toString("base64") } },
              { text: compositePrompt },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { imageSize: "2K" },
        },
      }),
      180_000,
      "Gemini generateContent (Render Step3 FinalComposite)"
    );

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const data = part.inlineData?.data;
      if (typeof data === "string" && data.length > 0) {
        return Buffer.from(data, "base64");
      }
    }
    console.warn(`[Render] Step 3: no image in response`);
    const err = new Error("Gemini returned no image for final composite");
    err.status = 502;
    throw err;
  });

  await updateJob({ progress: 90 });

  // 결과 R2 업로드
  const resultKey = `render/${influencerId}/${job.id}.png`;
  await r2.send(new PutObjectCommand({
    Bucket: r2Bucket, Key: resultKey, Body: resultBuffer, ContentType: "image/png",
  }));
  console.log(`[Render] Result uploaded to R2: ${resultKey}`);

  // 잡 완료
  await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      progress: 100,
      result: {
        type: "render_outfit",
        result_key: resultKey,
        mannequin_key: mannequinKey,
        outfit_sheet_key: outfitSheetKey,
      },
      updated_at: nowIso(),
    })
    .eq("id", job.id);

  console.log(`[Render] Job ${job.id} completed successfully.`);
}
[DISABLED - dance legacy] */

const RENDER_PROMPT_PREFIX = `Image 1 is a face pose sheet showing the same person from multiple angles.
Generate a photo of the person from image 1 as if taken on an iPhone. Natural iPhone-style photo texture and quality.
The image must feature only one main subject — the person from image 1. Do not add other main characters or prominent people. Background extras are acceptable, but the focus must be on the single person from image 1.

Situation:
`;

const REALISM_SUFFIX = `\n\nshot on iPhone, candid street snapshot, subject slightly off-center, imperfect framing, not a centered hero composition, face not fully presented to the camera, spontaneous moment, natural skin with pores and texture, realistic hair strands, authentic clothing wrinkles, natural available lighting only, casual smartphone photo, unplanned composition, no retouching, no beauty filter, no studio lighting, no CGI look, avoid perfectly centered subject placement, avoid clean hero-shot composition, avoid overly intentional framing`;

// ---------------------------------------------------------------------------
// Pipeline: Grok Prompt (render_grok)
// ---------------------------------------------------------------------------
/**
 * 현실감 후처리 — 폰카 직촬 느낌으로 변환
 * 1. 선명도 줄이기 (blur 0.5px)
 * 2. 채도 약간 낮추기 (saturation 0.92)
 * 3. 하이라이트 날림 + 암부 뭉침 (gamma 1.1)
 * 4. 약한 센서 노이즈 추가 (~1% luminance)
 * 5. JPEG 압축감 (quality 88 → PNG)
 */
// ---------------------------------------------------------------------------
// GPT Image 2 — aspect ratio → size 변환
// ---------------------------------------------------------------------------
function getGptImageSize(aspectRatio) {
  if (/^\d+x\d+$/.test(aspectRatio)) return aspectRatio;
  const map = {
    "1:1":  "1024x1024",
    "4:5":  "1024x1280",
    "3:4":  "1024x1360",
    "9:16": "1024x1824",
    "4:3":  "1360x1024",
    "16:9": "1824x1024",
  };
  return map[aspectRatio] ?? "1024x1024";
}

// ---------------------------------------------------------------------------
// GPT Image 2 — 이미지 편집 API (재시도 포함)
// ---------------------------------------------------------------------------
async function callGptImage2Edit(prompt, imageBuffers, aspectRatio) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const size = getGptImageSize(aspectRatio);

  // OpenAI gpt-image-2 는 PNG/JPG/WEBP 만 허용 (AVIF/HEIC 거부).
  // 라벨만 .jpg 로 붙여도 OpenAI 가 magic bytes 로 검증하므로
  // sharp 로 실제 인코딩을 JPEG 으로 normalize 한다.
  const { default: sharpMod } = await import("sharp");
  const normalizedBuffers = await Promise.all(
    imageBuffers.map(async (buf) => {
      try {
        return await sharpMod(buf).jpeg({ quality: 92 }).toBuffer();
      } catch (err) {
        console.warn(
          "[GPT Image 2] sharp normalize failed, sending original:",
          err?.message ?? err,
        );
        return buf;
      }
    }),
  );

  const files = await Promise.all(
    normalizedBuffers.map((buf, i) =>
      toFile(buf, `image_${i}.jpg`, { type: "image/jpeg" }),
    ),
  );

  return await withRetry(async () => {
    console.log(`[GPT Image 2] Calling gpt-image-2...`);
    const result = await withTimeout(
      openai.images.edit({
        model: "gpt-image-2",
        image: files.length === 1 ? files[0] : files,
        prompt,
        size,
        quality: "medium",
        n: 1,
      }),
      180_000,
      "OpenAI images.edit (GPT Image 2)"
    );
    const b64 = result.data[0]?.b64_json;
    if (b64) return Buffer.from(b64, "base64");
    console.warn(`[GPT Image 2] no image in response`);
    const err = new Error("GPT Image 2 returned no image");
    err.status = 502;
    throw err;
  });
}

async function applyRealismPostProcess(inputBuffer) {
  const sharp = (await import("sharp")).default;

  // Step 1-3: blur + desaturate + gamma
  let buf = await sharp(inputBuffer)
    .blur(1.2)
    .modulate({ saturation: 0.90 })
    .gamma(1.15)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Step 4: luminance noise injection
  const pixels = buf.data;
  const noiseStrength = 5;
  for (let i = 0; i < pixels.length; i += buf.info.channels) {
    const noise = (Math.random() - 0.5) * 2 * noiseStrength;
    for (let c = 0; c < Math.min(3, buf.info.channels); c++) {
      pixels[i + c] = Math.max(0, Math.min(255, pixels[i + c] + noise));
    }
  }

  // Step 5: JPEG compression → PNG
  const jpegBuf = await sharp(pixels, {
    raw: { width: buf.info.width, height: buf.info.height, channels: buf.info.channels },
  })
    .jpeg({ quality: 82 })
    .toBuffer();

  return sharp(jpegBuf).png().toBuffer();
}

// ---------------------------------------------------------------------------
// SceneBuilder: Gemini가 유저 프롬프트 + 스타일 데이터를 합성해 scenePrompt 생성
// ---------------------------------------------------------------------------
const SCENE_BUILD_SYSTEM_PROMPT = `Task: Build a scene description for an image generation prompt.
The final image will feature a real person provided via a separate face reference. Your job is to describe the scene around that person.

Priority order when details conflict:
1. Style guide — apply all style properties as the primary visual direction
2. User prompt — layer on top of the style; honor specific instructions but do not override style properties unless directly contradicted

Rules:
- Do NOT describe the person's face, facial features, or hair. Those come from a separate reference.
- Do NOT mention gender. Refer to the subject only as "the subject" or "a person".
- Do NOT ask follow-up questions or add commentary.
- Focus on: environment, scene setting, lighting quality, mood, props, body pose/orientation, clothing behavior, and composition framing.
- If a style specifies props to include (e.g. "cherry blossoms"), weave them naturally into the scene description.
- If a style specifies composition or camera angle, reflect it in how you frame the shot description.
- Write as one continuous paragraph, 80-160 words.
- No bullet points, no headers, no markdown, no preamble, no trailing commentary.

Output: one paragraph only.`;

// ---------------------------------------------------------------------------
// Vision: OpenAI gpt-5.4-mini로 레퍼런스 이미지 분석 → 프롬프트 생성
// ---------------------------------------------------------------------------
const VISION_SYSTEM_PROMPT = `Task: Analyze the reference image and the user's instructions. Write one unified image generation prompt.

Critical rules:
- Do NOT describe the person's face, facial identity, or facial features. The face comes from a separate reference.
- Do NOT mention gender. Refer to the subject only as "a person" or "the subject".
- Do NOT ask follow-up questions. Do NOT ask for clarification.
- Do NOT describe the person's hair, hairstyle, hair length, bangs, hair texture, or hair color. The hair comes from a separate reference.
- Do NOT reinterpret the shot as a studio portrait if the image reads as a casual selfie or everyday snapshot.
- Do NOT widen the framing beyond what is visible in the reference if the image is tightly cropped.

Step order:
1. Analyze the image: scene, environment, background elements, architectural structure, visible fixtures, time of day, weather, and depth separation between subject and background.
2. Analyze the camera: angle, distance to subject, framing, crop, lens feel, subject scale within the frame, selfie vs non-selfie perspective, and whether the image feels handheld or front-camera captured.
3. Analyze the subject: pose, body language, body orientation, head tilt, eye direction if inferable without describing facial features, clothing, accessory type and placement, and clothing wearing condition such as fitted, loose, draped, slipping, or off-shoulder.
4. Analyze the lighting: direction, quality (soft/hard), color temperature, shadows, visible light sources, contrast level, and how the light renders the skin, clothing, and surrounding space.
5. Analyze the mood: atmosphere, color palette, emotional tone, realism level, candid vs polished feel, smartphone-photo texture, and whether the image feels natural, commercial, editorial, or everyday.
6. Read the user's instructions and merge them naturally into the above, preserving any requested pose, composition, outfit behavior, environment structure, expression intensity, makeup emphasis, or capture realism while still obeying the face and hair restrictions.
7. Write the final prompt as one continuous paragraph, using concrete observable visual details rather than vague aesthetic language, and make sure the prompt preserves camera distance, framing tightness, head tilt, pose, clothing drape, background structure, lighting character, and photo realism.

Edge cases:
- If the user gives no instructions, base the prompt entirely on the image.
- If the user's instructions conflict with the image, prefer the user's instructions.
- If the image is unclear or ambiguous, describe what is most likely visible. Do not ask.
- If expression is relevant, describe only the visible intensity or mood in a non-identity-specific way without describing facial features.
- If eye makeup or eye emphasis is visually important, describe only the makeup intensity or visual sharpness without describing identity-specific eye shape.
- If the subject's face or hair is partially obscured, still avoid filling in missing facial or hair details and focus on non-face, non-hair visual information.

Output packaging:
- One paragraph, 80-200 words.
- No bullet points, no headers, no quotes, no markdown.
- No preamble before the paragraph.
- No explanation or commentary after the paragraph.
- No follow-up questions after the paragraph.

Example output:
A person standing at a crosswalk in a busy Japanese shopping street, seen from behind at mid-back level, slightly off-center to the left. Late afternoon overcast light with soft diffused shadows. The subject wears a red long-sleeve top with a casual everyday fit, and the framing preserves a natural street-snapshot distance with slight handheld realism. Surrounding environment includes colorful storefront signage, a blue pedestrian crossing sign in the upper right, and scattered pedestrians in the background, with clear spatial separation between the subject and the street behind. Muted urban color palette with pops of red and blue. Casual candid street snapshot composition, natural depth of field, slightly imperfect framing, authentic real-world photo texture rather than a polished studio look.`;

async function buildScenePrompt(userPrompt, styleData) {
  if (!GEMINI_API_KEY) {
    console.warn("[SceneBuilder] GEMINI_API_KEY not set, using raw prompt");
    return userPrompt;
  }

  const model = process.env.VISION_MODEL ?? "gemini-3.1-flash-lite-preview";

  // 스타일 데이터를 텍스트로 직렬화
  const styleLines = [];
  if (styleData) {
    if (styleData.mood_keywords?.length)
      styleLines.push(`Mood: ${styleData.mood_keywords.slice(0, 5).join(", ")}`);
    if (styleData.prop_keywords?.length)
      styleLines.push(`Must include in scene: ${styleData.prop_keywords.slice(0, 5).join(", ")}`);
    const sc = styleData.scene ?? {};
    if (sc.background?.trim()) {
      const depthMap = { flat: "flat background", shallow: "shallow space", deep: "deep space" };
      const scParts = [sc.background.trim()];
      if (sc.depth) scParts.push(depthMap[sc.depth] ?? sc.depth);
      styleLines.push(`Scene: ${scParts.join(", ")}`);
    }
    const l = styleData.lighting ?? {};
    const contrastMap = { soft: "soft", medium: "balanced", hard: "dramatic" };
    const sourceMap = { natural: "natural", studio: "studio", mixed: "mixed" };
    const dirMap = { front: "front", side: "side", back: "backlit", top: "overhead" };
    const tempMap = { warm: "warm", neutral: "neutral", cool: "cool" };
    const lParts = [];
    if (l.source) {
      const prefix = l.contrast ? `${contrastMap[l.contrast] ?? l.contrast} ` : "";
      lParts.push(`${prefix}${sourceMap[l.source] ?? l.source} lighting`);
    } else if (l.contrast) {
      lParts.push(`${contrastMap[l.contrast] ?? l.contrast} lighting`);
    }
    if (l.direction) lParts.push(`${dirMap[l.direction] ?? l.direction} light`);
    if (l.color_temperature) lParts.push(`${tempMap[l.color_temperature] ?? l.color_temperature} color temperature`);
    if (lParts.length) styleLines.push(`Lighting: ${lParts.join(", ")}`);
  }

  const styleSection = styleLines.length
    ? `Style guide (PRIMARY — apply all properties as the core visual direction):\n${styleLines.join("\n")}`
    : "";
  const userSection = userPrompt?.trim()
    ? `User prompt (layer on top of style, do not override style properties): ${userPrompt.trim()}`
    : "No user prompt provided. Build the scene entirely from the style guide.";

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        config: {
          systemInstruction: SCENE_BUILD_SYSTEM_PROMPT,
          maxOutputTokens: 300,
        },
        contents: [{
          role: "user",
          parts: [{ text: styleSection + "\n\n" + userSection }],
        }],
      }),
      60_000,
      "Gemini generateContent (SceneBuilder)"
    );

    const content = response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!content) {
      console.warn("[SceneBuilder] Gemini returned empty response, using raw prompt");
      return userPrompt;
    }

    console.log(`[SceneBuilder] Generated scene prompt (${content.length} chars)`);
    return content;
  } catch (e) {
    console.warn(`[SceneBuilder] Gemini failed: ${e.message}, using raw prompt`);
    return userPrompt;
  }
}

async function analyzeReferenceImage(imageB64, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const model = process.env.VISION_MODEL ?? "gemini-3.1-flash-lite-preview";
  const userMessage = userPrompt ? `User instructions: ${userPrompt}` : "No additional instructions.";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: VISION_SYSTEM_PROMPT },
            { inlineData: { mimeType: "image/jpeg", data: imageB64 } },
            { text: userMessage },
          ],
        },
      ],
      config: {
        maxOutputTokens: 300,
      },
    }),
    60_000,
    "Gemini generateContent (analyzeReferenceImage)"
  );

  const content = response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join("")
    .trim();
  if (!content) {
    const err = new Error("Gemini Vision returned empty response");
    err.status = 502;
    throw err;
  }

  console.log(`[Vision] Generated prompt (${content.length} chars)`);
  return content;
}

async function processRenderGrokJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const faceSheetKey = payload.face_sheet_key;
  const userPrompt = payload.prompt ?? "";
  const influencerId = payload.influencer_id;
  const aspectRatio = payload.aspect_ratio ?? "1:1";

  if (!faceSheetKey || !userPrompt || !influencerId) {
    throw new Error("Missing face_sheet_key, prompt, or influencer_id");
  }

  const XAI_API_KEY = process.env.XAI_API_KEY ?? "";
  if (!XAI_API_KEY) throw new Error("XAI_API_KEY not set");

  await updateJob({ progress: 5 });
  console.log(`[RenderGrok] Starting job ${job.id}`);

  // ── 스타일 데이터 조회 ────────────────────────────────────────────────
  let styleData = null;
  if (payload.style_id) {
    const { data, error: styleErr } = await supabase
      .from("styles")
      .select("mood_keywords, prop_keywords, scene, lighting, style_sheet_url")
      .eq("id", payload.style_id)
      .single();
    if (styleErr) console.warn(`[RenderGrok] Style fetch error: ${styleErr.message}`);
    if (data) {
      styleData = data;
      console.log(`[RenderGrok] Style loaded: ${payload.style_id}`);
    }
  }

  // ── Scene prompt 생성 (Gemini: 유저 프롬프트 1순위 + 스타일 2순위) ───
  await updateJob({ progress: 10 });
  const scenePrompt = await buildScenePrompt(userPrompt, styleData);
  console.log(`[RenderGrok] Scene prompt: ${scenePrompt.substring(0, 100)}...`);

  await updateJob({ progress: 20 });

  // Download face sheet from R2 → base64
  const faceSheetBuf = await downloadR2(faceSheetKey);
  const faceSheetB64 = faceSheetBuf.toString("base64");

  // ── Style sheet 다운로드 및 리사이즈 (public R2 URL) ─────────────────
  let styleSheetResized = null;
  const styleSheetUrlGrok = toR2PublicUrl(styleData?.style_sheet_url);
  if (styleSheetUrlGrok) {
    try {
      const ssResp = await fetch(styleSheetUrlGrok, { signal: AbortSignal.timeout(30_000) });
      if (!ssResp.ok) throw new Error(`HTTP ${ssResp.status}`);
      const ssRaw = Buffer.from(await ssResp.arrayBuffer());
      styleSheetResized = await resizeForApi(ssRaw, 1024);
      console.log(`[RenderGrok] Style sheet downloaded and resized (${styleSheetResized.length} bytes)`);
    } catch (e) {
      console.warn(`[RenderGrok] Style sheet download failed (non-fatal): ${e.message}`);
      styleSheetResized = null;
    }
  }

  // ── Brand profile style hint ──────────────────────────────────────────
  const brandHint = await fetchBrandProfileStyleHint(payload.profile_id);
  if (brandHint) console.log(`[RenderGrok] Brand profile hint applied (${brandHint.length} chars)`);

  // ── Props — Grok에 직접 강제 지시 ────────────────────────────────────
  const propKeywords = styleData?.prop_keywords?.filter(Boolean) ?? [];
  const propHint = propKeywords.length
    ? `\n\nThe following props MUST appear visibly in the image: ${propKeywords.join(", ")}.`
    : "";

  const realism = payload.realism === true;

  // style_sheet 유무에 따라 prefix 분기
  const grokPromptPrefix = styleSheetResized
    ? `Image 1 is a face pose sheet showing the same person from multiple angles.\nImage 2 is a visual style reference sheet (color palette swatches and props). Use Image 2 as a reference only — do NOT reproduce the color swatches or reference sheet layout in the output. Apply only the color mood and palette to the scene lighting and atmosphere.\nGenerate a photo of the person from image 1 as if taken on an iPhone. Natural iPhone-style photo texture and quality.\nThe image must feature only one main subject — the person from image 1. Do not add other main characters or prominent people. Background extras are acceptable, but the focus must be on the single person from image 1.\n\nSituation:\n`
    : RENDER_PROMPT_PREFIX;

  const fullPrompt = grokPromptPrefix + scenePrompt + propHint + brandHint + (realism ? REALISM_SUFFIX : "");
  const grokModel = process.env.GROK_IMAGE_MODEL ?? "grok-imagine-image";

  const imageApi = payload.image_api ?? "gpt"; // "grok" | "gpt"

  const faceSheetResized = await resizeForApi(faceSheetBuf, 1024);
  const apiImages = [faceSheetResized, ...(styleSheetResized ? [styleSheetResized] : [])];

  let resultBuffer = null;

  if (imageApi === "grok") {
    resultBuffer = await withRetry(async () => {
      console.log(`[RenderGrok] Calling ${grokModel}...`);
      const resp = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${XAI_API_KEY}` },
        body: JSON.stringify({
          model: grokModel,
          prompt: fullPrompt,
          n: 1,
          resolution: "2k",
          aspect_ratio: aspectRatio,
          images: [
            { type: "image_url", url: `data:image/png;base64,${faceSheetB64}` },
            ...(styleSheetResized
              ? [{ type: "image_url", url: `data:image/jpeg;base64,${styleSheetResized.toString("base64")}` }]
              : []),
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw Object.assign(new Error(`xAI ${resp.status}: ${errText.substring(0, 200)}`), { status: resp.status });
      }
      const data = await resp.json();
      const b64 = data.data?.[0]?.b64_json;
      const imgUrl = data.data?.[0]?.url;
      if (b64) return Buffer.from(b64, "base64");
      if (imgUrl) { const dl = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) }); if (dl.ok) return Buffer.from(await dl.arrayBuffer()); }
      console.warn(`[RenderGrok] no image in response`);
      const err = new Error("Grok returned no image");
      err.status = 502;
      throw err;
    });
  } else {
    resultBuffer = await callGptImage2Edit(fullPrompt, apiImages, aspectRatio);
  }

  await updateJob({ progress: 75 });

  if (realism && imageApi === "grok" && resultBuffer) {
    console.log("[RenderGrok] Applying realism post-processing...");
    resultBuffer = await applyRealismPostProcess(resultBuffer);
    console.log("[RenderGrok] Post-processing done.");
  }

  await updateJob({ progress: 90 });

  const resultKey = imageApi === "grok"
    ? `render/${influencerId}/${job.id}.png`
    : `render/${influencerId}/${job.id}_gpt.png`;

  const wmBrandId = job.brand_id ?? job.payload?.brand_id ?? null;
  const finalBuffer = await applyWatermarkIfNeeded(supabase, wmBrandId, resultBuffer);
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: resultKey, Body: finalBuffer, ContentType: "image/png" }));

  await updateJob({
    status: "succeeded",
    progress: 100,
    result: {
      type: "render_prompt",
      result_key: resultKey,
      ...(imageApi === "grok" ? { grok_key: resultKey } : { gpt_key: resultKey }),
      final_prompt: fullPrompt,
    },
  });

  const brandId = job.brand_id ?? job.payload?.brand_id;
  if (brandId) {
    const { error: assetErr } = await supabase.from("assets").insert([{
      brand_id: brandId,
      job_id: job.id,
      kind: "render_prompt",
      r2_key: resultKey,
      model_id: job.payload?.influencer_id ?? null,
      product_id: job.payload?.product_id ?? null,
      style_id: job.payload?.style_id ?? null,
    }]);
    if (assetErr) console.error(`[RenderGrok] assets insert failed:`, assetErr.message);
  }

  console.log(`[RenderGrok] Job ${job.id} completed. api=${imageApi}`);
}

// ---------------------------------------------------------------------------
// Brand profile style hint helper
// ---------------------------------------------------------------------------
async function fetchBrandProfileStyleHint(profileId) {
  if (!profileId) return "";
  try {
    const { data, error } = await supabase
      .from("brand_profiles")
      .select("refined_profile")
      .eq("id", profileId)
      .single();
    if (error || !data?.refined_profile) return "";
    const rp = data.refined_profile;
    const parts = [];

    // Brand identity
    if (rp.brand_identity?.tone) parts.push(`Tone: ${rp.brand_identity.tone.replace(/_/g, " ")}`);
    if (rp.brand_identity?.style_summary) parts.push(`Style: ${rp.brand_identity.style_summary}`);
    const mood = rp.brand_identity?.mood_axis;
    if (mood) {
      const axes = [];
      if (mood.minimal_vs_rich && mood.minimal_vs_rich !== "medium") axes.push(mood.minimal_vs_rich === "low" || mood.minimal_vs_rich === "very_low" ? "minimal" : "rich/ornate");
      if (mood.soft_vs_sharp && mood.soft_vs_sharp !== "medium") axes.push(mood.soft_vs_sharp === "low" || mood.soft_vs_sharp === "very_low" ? "soft" : "sharp/edgy");
      if (mood.natural_vs_editorial && mood.natural_vs_editorial !== "medium") axes.push(mood.natural_vs_editorial === "low" || mood.natural_vs_editorial === "very_low" ? "natural" : "editorial");
      if (mood.calm_vs_energetic && mood.calm_vs_energetic !== "medium") axes.push(mood.calm_vs_energetic === "low" || mood.calm_vs_energetic === "very_low" ? "calm" : "energetic");
      if (mood.mass_vs_premium && mood.mass_vs_premium !== "medium") axes.push(mood.mass_vs_premium === "low" || mood.mass_vs_premium === "very_low" ? "approachable" : "premium/luxury");
      if (axes.length) parts.push(`Mood: ${axes.join(", ")}`);
    }

    // Color system
    if (rp.color_system?.dominant_palette?.length)
      parts.push(`Brand colors: ${rp.color_system.dominant_palette.join(", ")}`);
    if (rp.color_system?.base_temperature) parts.push(`Color temperature: ${rp.color_system.base_temperature}`);
    if (rp.color_system?.saturation_level && rp.color_system.saturation_level !== "medium")
      parts.push(`Saturation: ${rp.color_system.saturation_level}`);

    // Lighting system
    if (rp.lighting_system?.lighting_style) parts.push(`Lighting: ${rp.lighting_system.lighting_style.replace(/_/g, " ")}`);
    if (rp.lighting_system?.shadow_softness) parts.push(`Shadows: ${rp.lighting_system.shadow_softness}`);
    if (rp.lighting_system?.glow_feel && rp.lighting_system.glow_feel !== "none")
      parts.push(`Glow: ${rp.lighting_system.glow_feel}`);

    // Texture system
    if (rp.texture_system?.surface_finish) parts.push(`Surface finish: ${rp.texture_system.surface_finish.replace(/_/g, " ")}`);
    if (rp.texture_system?.image_cleanliness) parts.push(`Image cleanliness: ${rp.texture_system.image_cleanliness.replace(/_/g, " ")}`);

    // Composition system
    if (rp.composition_system?.negative_space && rp.composition_system.negative_space !== "medium")
      parts.push(`Negative space: ${rp.composition_system.negative_space}`);
    if (rp.composition_system?.cropping_style) parts.push(`Cropping: ${rp.composition_system.cropping_style.replace(/_/g, " ")}`);

    // Background system
    if (rp.background_system?.background_style) parts.push(`Background: ${rp.background_system.background_style.replace(/_/g, " ")}`);
    if (rp.background_system?.depth_feel) parts.push(`Depth feel: ${rp.background_system.depth_feel.replace(/_/g, " ")}`);

    // Camera system
    if (rp.camera_system?.lens_feel) parts.push(`Lens feel: ${rp.camera_system.lens_feel.replace(/_/g, " ")}`);
    if (rp.camera_system?.distance_preference) parts.push(`Camera distance: ${rp.camera_system.distance_preference.replace(/_/g, " ")}`);

    // Semantic keywords
    if (rp.semantic_keywords?.visual_keywords?.length)
      parts.push(`Visual keywords: ${rp.semantic_keywords.visual_keywords.slice(0, 8).join(", ")}`);
    if (rp.semantic_keywords?.avoid_patterns?.length)
      parts.push(`Avoid: ${rp.semantic_keywords.avoid_patterns.slice(0, 5).join(", ")}`);

    // Control hints
    if (rp.control_hints?.must_keep?.length)
      parts.push(`Must keep: ${rp.control_hints.must_keep.slice(0, 5).join(", ")}`);

    if (parts.length === 0) return "";
    return `\n\nBrand style guide — apply these to the overall look and feel:\n${parts.join("\n")}`;
  } catch (e) {
    console.warn(`[BrandProfile] Failed to fetch profile ${profileId}: ${e.message}`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Pipeline: Object Render (render_product_solo)
// ---------------------------------------------------------------------------
const PRODUCT_SCENE_BUILD_SYSTEM_PROMPT = `Task: Build a product photography scene description for an image generation prompt.
A product image is provided separately. Your job is to describe the environment, background, and atmosphere in which to place that product.

Priority order when details conflict:
1. Style guide — apply all style properties as the core visual direction
2. User prompt — layer on top of the style; honor specific instructions but do not override style properties unless directly contradicted

Rules:
- Do NOT describe the product itself. The product comes from a separate image.
- Focus ONLY on: background type, surface/table material, lighting quality and direction, mood, color palette, props or decorative elements, composition framing, negative space.
- If a style specifies props to include (e.g. "cherry blossoms", "coffee beans"), include them naturally in the environment.
- If a style specifies composition or camera angle, reflect it in the framing description.
- Write as one continuous paragraph, 60-140 words.
- No bullet points, no headers, no markdown, no preamble, no trailing commentary.

Output: one paragraph only.`;

const PERSON_PRODUCT_SCENE_BUILD_SYSTEM_PROMPT = `Task: Build a complete scene description for a person-with-product photo shoot, for use as an image generation prompt.
A face sheet (multiple angles of the same person) and a product image are provided separately. Your job is to describe the full visual scene including environment, person styling, pose, and composition.

Priority order when details conflict:
1. Style guide — apply all style properties as the core visual direction
2. User prompt — layer on top of the style; honor specific instructions but do not override style properties unless directly contradicted

Rules:
- Do NOT describe the person's face or identity — that comes from the face sheet.
- Do NOT describe the product itself — that comes from the product image.
- Describe ALL of the following in one paragraph:
  1. Environment & background: setting type, surface, depth, atmosphere, props or decorative elements from the style
  2. Lighting: quality, direction, color temperature, and mood
  3. Clothing & styling: a complete, specific outfit (top, bottom, outerwear, accessories as appropriate) that fits the environment, season, and style mood — describe actual garment types, colors, and textures
  4. Pose & body language: how the person stands, sits, or moves; how they hold or interact with the product; overall energy of the pose
  5. Composition & framing: camera angle, shot distance (full body / half body / close-up), subject placement, negative space
- The person must be described as clearly positioned above the ground — standing, sitting, or posed naturally — never buried in, submerged in, or emerging from the background environment.
- Write as one continuous paragraph, 80-180 words.
- No bullet points, no headers, no markdown, no preamble, no trailing commentary.

Output: one paragraph only.`;

const OBJECT_VISION_SYSTEM_PROMPT = `Task: Analyze the reference product photo. Write an image generation prompt that captures the same visual style.

Critical rules:
- Focus ONLY on the environment and style, NOT the product itself.
- Do NOT describe the product's shape, form, material, color, packaging type, cap, label, or any physical attribute of the product.
- Do NOT name specific brands or products.
- Do NOT ask follow-up questions.
- The product will be replaced with a different one. Only describe what surrounds it.

Step order:
1. Analyze the background: color, texture, material, gradient, surface type.
2. Analyze the lighting: direction, quality, reflections, highlights, shadow style.
3. Analyze the composition: camera angle, distance, framing, placement position, negative space.
4. Analyze the mood: color palette, tone, premium vs casual feel, clean vs textured aesthetic.
5. Analyze any decorative or accent elements: texture swatches, props, scattered ingredients, fabric, leaves, splashes, etc.
6. Read the user's instructions and merge them naturally.
7. Write one continuous paragraph, 80-200 words. Describe only the scene/environment/style — never the product.

Edge cases:
- If no user instructions, base the prompt entirely on the image style.
- If user instructions conflict with the image style, prefer user instructions.

Output packaging:
- One paragraph, 80-200 words.
- No bullet points, no headers, no quotes, no markdown.
- No preamble, no commentary, no follow-up questions.

Example output:
A smooth creamy beige surface with a thin layer of white cream spread as a texture accent near the product placement area. Soft diffused studio lighting from the upper left creating gentle shadows on the right side. Clean minimal composition with generous negative space above, the product positioned slightly off-center. Warm neutral color palette with cream, ivory, and bronze tones. Premium commercial product photography aesthetic with shallow depth of field and a seamless gradient background transitioning from warm beige to slightly lighter cream at the top. High-key lighting with soft highlights and no harsh reflections.`;

const OBJECT_RENDER_PROMPT_PREFIX = `The image shows the target product. Place this exact product into a new scene as described below.

Critical rules:
- Keep from the product image: exact shape, exact packaging, exact label, exact text, exact logo, exact colors, exact design, exact material and surface texture (glass, plastic, metal, matte, glossy, frosted, brushed, transparent, etc.), exact reflectivity, sheen, and tactile quality.
- Build the new environment (background, surface, lighting, mood) entirely from the scene description below.
- Do NOT invent or add any product not shown in the image.

Text and logo fidelity is critical:
- Preserve every letter, word, and character exactly as shown.
- Do not rearrange, omit, abbreviate, or rephrase any text.
- Maintain exact font style, size, weight, spacing, and placement.
- Logos must keep their exact shape, proportion, and position.

Scene to create:
`;

// ---------------------------------------------------------------------------
// Quick mode auto-match: Vision picks the best-fitting pattern for the
// product image from a small per-(category, format) candidate pool.
// Returns the chosen pattern, or null when category/format has no candidates.
// All other failure modes (parse error, timeout, invalid key) fall back to
// the first candidate so the pipeline still produces output.
// ---------------------------------------------------------------------------
async function selectQuickPattern({ imageBuffer, mimeType, category, format }) {
  const candidates = getPatternsFor(category, format);
  if (!candidates.length) {
    console.warn(`[QuickMatch] No candidates for ${category}/${format}`);
    return null;
  }

  if (!GEMINI_API_KEY) {
    console.warn("[QuickMatch] GEMINI_API_KEY not set, falling back to first candidate");
    return { pattern: candidates[0] };
  }

  const model = process.env.VISION_MODEL ?? "gemini-3.1-flash-lite-preview";
  const candidateBrief = candidates.map((p) => ({
    key: p.key,
    name: p.name,
    hints: p.visualHints,
  }));

  const matcherPrompt = [
    "You are a visual style matcher for product photography.",
    "Look at the product image provided and choose ONE pattern key from the candidate list whose visual hints best match the product's visual character (material, color, packaging, target audience, intended mood).",
    "",
    "Candidates:",
    JSON.stringify(candidateBrief, null, 2),
    "",
    "Output format: a single line containing only the chosen key string. No quotes, no markdown, no explanation, no trailing punctuation.",
  ].join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: (await resizeForApi(imageBuffer, 1024)).toString("base64") } },
              { text: matcherPrompt },
            ],
          },
        ],
        config: { maxOutputTokens: 30 },
      }),
      30_000,
      "Gemini generateContent (QuickMatch)"
    );

    const raw = response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!raw) {
      console.warn("[QuickMatch] Empty response, using first candidate");
      return { pattern: candidates[0] };
    }

    // Tolerant parse: strip whitespace, quotes, backticks, trailing punctuation.
    const cleaned = raw
      .split(/\r?\n/)[0]
      .replace(/^["'`\s]+|["'`\s.,;:]+$/g, "")
      .toLowerCase();

    const exact = candidates.find((p) => p.key.toLowerCase() === cleaned);
    if (exact) return { pattern: exact };

    // Fuzzy: model wrote `key: foo` or extra prose — find any candidate key
    // appearing as a substring of the response.
    const fuzzy = candidates.find((p) => cleaned.includes(p.key.toLowerCase()));
    if (fuzzy) {
      console.log(`[QuickMatch] Fuzzy-matched "${cleaned}" -> ${fuzzy.key}`);
      return { pattern: fuzzy };
    }

    // Last-resort cross-check across the global catalog (in case Vision picked
    // a valid key from the wrong category — still better than first-candidate
    // when its hints clearly fit, but only if the category matches our intent).
    const globalHit = getPatternByKey(cleaned);
    if (globalHit && globalHit.category === category && globalHit.format === format) {
      return { pattern: globalHit };
    }

    console.warn(`[QuickMatch] Could not resolve "${raw.slice(0, 60)}", using first candidate`);
    return { pattern: candidates[0] };
  } catch (e) {
    console.warn(`[QuickMatch] Vision call failed: ${e.message}, using first candidate`);
    return { pattern: candidates[0] };
  }
}

async function processRenderObjectJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const objectImageKey = payload.object_image_key;
  let userPrompt = payload.prompt ?? "";
  const aspectRatio = payload.aspect_ratio ?? "1:1";

  if (!objectImageKey) throw new Error("Missing object_image_key");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  await updateJob({ progress: 5 });
  console.log(`[RenderObject] Starting job ${job.id}`);

  // ── 스타일 데이터 조회 ────────────────────────────────────────────────
  let styleData = null;
  if (payload.style_id) {
    const { data, error: styleErr } = await supabase
      .from("styles")
      .select("mood_keywords, prop_keywords, scene, lighting, color_palette, style_sheet_url")
      .eq("id", payload.style_id)
      .single();
    if (styleErr) console.warn(`[RenderObject] Style fetch error: ${styleErr.message}`);
    if (data) {
      styleData = data;
      console.log(`[RenderObject] Style loaded: ${payload.style_id}`);
    }
  }

  // ── 제품 이미지 다운로드 (auto-match가 이미지를 필요로 하므로 먼저 수행) ──
  await updateJob({ progress: 10 });
  const objectBuf = await downloadR2(objectImageKey);
  const objectB64 = objectBuf.toString("base64");
  const objectMimeType = /\.(jpg|jpeg)$/i.test(objectImageKey) ? "image/jpeg" : "image/png";

  // ── Quick auto-match: 카테고리 + 포맷 후보군 중 Vision 선택 ──────────────
  let selectedPatternKey = null;
  if (payload.auto_match && payload.category && payload.mood_format) {
    await updateJob({ progress: 15 });
    try {
      const matchResult = await selectQuickPattern({
        imageBuffer: objectBuf,
        mimeType: objectMimeType,
        category: payload.category,
        format: payload.mood_format,
      });
      if (matchResult?.pattern) {
        userPrompt = matchResult.pattern.scenePrompt;
        selectedPatternKey = matchResult.pattern.key;
        console.log(`[RenderObject] Auto-matched pattern: ${selectedPatternKey}`);
      } else {
        const fallbackByFormat = {
          mood: "Lifestyle product shot with mood-evoking environment, soft natural light, refined editorial composition.",
          model: "Lifestyle product shot featuring a person interacting with the item, soft natural light, candid editorial composition.",
        };
        userPrompt = fallbackByFormat[payload.mood_format] ?? userPrompt;
        console.warn(`[RenderObject] Pattern matching failed, using fallback prompt for ${payload.mood_format}`);
      }
    } catch (e) {
      const fallbackByFormat = {
        mood: "Lifestyle product shot with mood-evoking environment, soft natural light, refined editorial composition.",
        model: "Lifestyle product shot featuring a person interacting with the item, soft natural light, candid editorial composition.",
      };
      userPrompt = fallbackByFormat[payload.mood_format] ?? userPrompt;
      console.warn(`[RenderObject] Pattern matching failed (non-fatal): ${e.message}`);
    }
  }

  // ── Scene prompt 생성 (Gemini: 유저 프롬프트 1순위 + 스타일 2순위) ───
  await updateJob({ progress: 25 });
  const scenePrompt = await buildProductScenePrompt(userPrompt, styleData);
  console.log(`[RenderObject] Scene prompt: ${scenePrompt.substring(0, 100)}...`);

  // ── Style sheet 다운로드 (public R2 URL) ─────────────────────────────
  let styleSheetBufObj = null;
  const styleSheetUrlObj = toR2PublicUrl(styleData?.style_sheet_url);
  if (styleSheetUrlObj) {
    try {
      const ssResp = await fetch(styleSheetUrlObj, { signal: AbortSignal.timeout(30_000) });
      if (!ssResp.ok) throw new Error(`HTTP ${ssResp.status}`);
      const ssRaw = Buffer.from(await ssResp.arrayBuffer());
      styleSheetBufObj = await resizeForApi(ssRaw, 1024);
      console.log(`[RenderObject] Style sheet downloaded and resized (${styleSheetBufObj.length} bytes)`);
    } catch (e) {
      console.warn(`[RenderObject] Style sheet download failed (non-fatal): ${e.message}`);
      styleSheetBufObj = null;
    }
  }

  // ── Props 강제 지시 ───────────────────────────────────────────────────
  const propKeywords = styleData?.prop_keywords?.filter(Boolean) ?? [];
  const propHint = propKeywords.length
    ? `\n\nThe following props MUST appear visibly in the scene: ${propKeywords.join(", ")}.`
    : "";

  // ── Brand profile style hint ──────────────────────────────────────────
  const brandHint = await fetchBrandProfileStyleHint(payload.profile_id);
  if (brandHint) console.log(`[RenderObject] Brand profile hint applied (${brandHint.length} chars)`);

  // ── fullPrompt 조합 (style_sheet 유무에 따라 prefix 분기) ─────────────
  await updateJob({ progress: 35 });
  const objectPromptPrefix = styleSheetBufObj
    ? `Image 1 is a visual style reference sheet (color palette swatches and prop elements). Use Image 1 as a reference only — do NOT reproduce the color swatches or reference sheet layout in the output. Apply only the color mood and palette to the scene lighting and atmosphere.\nImage 2 shows the target product. Place this exact product into a new scene as described below.\n\nCritical rules:\n- Apply the visual style from Image 1.\n- Keep from Image 2: exact shape, exact packaging, exact label, exact text, exact logo, exact colors, exact design, exact material and surface texture (glass, plastic, metal, matte, glossy, frosted, brushed, transparent, etc.), exact reflectivity, sheen, and tactile quality.\n- Build the new environment (background, surface, lighting, mood) entirely from the scene description below AND the style sheet in Image 1.\n- Do NOT invent or add any product not shown in image 2.\n`
    : OBJECT_RENDER_PROMPT_PREFIX;
  const fullPrompt = objectPromptPrefix + scenePrompt + propHint + brandHint;

  // ── Gemini 이미지 생성 ─────────────────────────────────────────────────
  const aiObj = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const resultBuffer = await withRetry(async () => {
    console.log(`[RenderObject] Calling ${GEMINI_IMAGE_MODEL}...`);

    // style_sheet 유무에 따라 parts 배열 분기
    const objectParts = styleSheetBufObj
      ? [
          { inlineData: { mimeType: "image/jpeg", data: styleSheetBufObj.toString("base64") } },
          { inlineData: { mimeType: objectMimeType, data: objectB64 } },
          { text: fullPrompt },
        ]
      : [
          { inlineData: { mimeType: objectMimeType, data: objectB64 } },
          { text: fullPrompt },
        ];

    const response = await withTimeout(
      aiObj.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [{ role: "user", parts: objectParts }],
        config: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { imageSize: "2K", aspectRatio: getGeminiAspectRatio(aspectRatio) } },
      }),
      180_000,
      "Gemini generateContent (RenderObject)"
    );
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const d = part.inlineData?.data;
      if (typeof d === "string" && d.length > 0) return Buffer.from(d, "base64");
    }
    console.warn(`[RenderObject] no image in response`);
    const err = new Error("Gemini returned no image");
    err.status = 502;
    throw err;
  });

  await updateJob({ progress: 85 });

  // ── R2 업로드 ──────────────────────────────────────────────────────────
  const resultKey = `render/objects/${job.id}.png`;
  const wmBrandId = job.brand_id ?? job.payload?.brand_id ?? null;
  const resultBufferFinal = await applyWatermarkIfNeeded(supabase, wmBrandId, resultBuffer);
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: resultKey, Body: resultBufferFinal, ContentType: "image/png" }));

  // ── Assets 저장 ────────────────────────────────────────────────────────
  const brandId = job.brand_id ?? job.payload?.brand_id;
  let savedAssetId = null;
  if (brandId) {
    const { data: assetRow, error: assetErr } = await supabase
      .from("assets")
      .insert({
        brand_id: brandId,
        job_id: job.id,
        kind: "render_product_solo",
        r2_key: resultKey,
        model_id: job.payload?.influencer_id ?? null,
        product_id: job.payload?.product_id ?? null,
        style_id: job.payload?.style_id ?? null,
      })
      .select("id")
      .single();
    if (assetErr) {
      console.error(`[RenderObject] assets insert failed:`, assetErr.message);
    } else {
      savedAssetId = assetRow?.id ?? null;
    }
  }

  await updateJob({
    status: "succeeded",
    progress: 100,
    result: {
      type: "render_product_solo",
      result_key: resultKey,
      final_prompt: fullPrompt,
      asset_id: savedAssetId,
      selected_pattern_key: selectedPatternKey,
    },
  });

  console.log(`[RenderObject] Job ${job.id} completed.`);
}

// ---------------------------------------------------------------------------
// Quick Mood Render — 고정 프롬프트 + gpt-image-2
// ---------------------------------------------------------------------------
const QUICK_MOOD_PROMPT =
  "이 제품의 이커머스 판매용 썸네일 이미지를 생성해줘. 제품이 잘 보이고, 제품과 어울리는 배경도 생성해줘.";

async function processRenderQuickMoodJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const objectImageKey = payload.object_image_key;

  await updateJob({ progress: 5 });
  console.log(`[QuickMood] Starting job ${job.id}`);

  if (!objectImageKey) throw new Error("Missing object_image_key");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  // ── 제품 이미지 R2 다운로드 ───────────────────────────────────────────────
  await updateJob({ progress: 15 });
  const objectBuf = await downloadR2(objectImageKey);
  const resizedBuf = await resizeForApi(objectBuf, 1024);
  console.log(`[QuickMood] Product image downloaded and resized (${resizedBuf.length} bytes)`);

  await updateJob({ progress: 30 });
  console.log(`[QuickMood] Using fixed prompt`);

  // ── GPT Image 2 호출 ──────────────────────────────────────────────────────
  await updateJob({ progress: 40 });
  const resultBuffer = await callGptImage2Edit(QUICK_MOOD_PROMPT, [resizedBuf], "1024x1024");
  console.log(`[QuickMood] GPT Image 2 call complete (${resultBuffer.length} bytes)`);

  // ── 워터마크 ─────────────────────────────────────────────────────────────
  await updateJob({ progress: 85 });
  const wmBrandId = job.brand_id ?? job.payload?.brand_id ?? null;
  const resultBufferFinal = await applyWatermarkIfNeeded(supabase, wmBrandId, resultBuffer);

  // ── sharp 후처리 (1000x1000 JPEG) ────────────────────────────────────────
  const sharp = (await import("sharp")).default;
  const processedBuffer = await sharp(resultBufferFinal)
    .resize(1000, 1000)
    .jpeg({ quality: 90 })
    .toBuffer();

  // ── R2 업로드 ─────────────────────────────────────────────────────────────
  const resultKey = `render/quick_mood/${job.id}.jpg`;
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: resultKey, Body: processedBuffer, ContentType: "image/jpeg" }));
  console.log(`[QuickMood] R2 upload done: ${resultKey}`);

  // ── Assets 저장 ───────────────────────────────────────────────────────────
  const brandId = job.brand_id ?? job.payload?.brand_id;
  let savedAssetId = null;
  if (brandId) {
    const { data: assetRow, error: assetErr } = await supabase
      .from("assets")
      .insert({
        brand_id: brandId,
        job_id: job.id,
        kind: "render_quick_mood",
        r2_key: resultKey,
        product_id: payload.product_id ?? null,
      })
      .select("id")
      .single();
    if (assetErr) {
      console.error(`[QuickMood] assets insert failed:`, assetErr.message);
    } else {
      savedAssetId = assetRow?.id ?? null;
    }
  }

  await updateJob({
    status: "succeeded",
    progress: 100,
    result: {
      type: "render_quick_mood",
      result_key: resultKey,
      asset_id: savedAssetId,
    },
  });

  console.log(`[QuickMood] Job ${job.id} completed.`);
}

// ---------------------------------------------------------------------------
// Quick Model Render — 성별 한 줄 + 고정 프롬프트 + gpt-image-2
// ---------------------------------------------------------------------------
const QUICK_MODEL_PROMPT =
  "이 제품의 이커머스 판매용 썸네일 이미지를 생성해줘. 제품과 모델이 함께 나온 이미지로 만드는데, 제품이 잘 보이도록 하고, 제품과 어울리는 배경도 생성해줘. 인물은 ai 같지 않고 실제 사람 모델처럼 만들어.";

async function processRenderQuickModelJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const objectImageKey = payload.object_image_key;
  const gender = payload.gender === "male" ? "male" : "female"; // 기본값 female, 그 외 입력은 안전하게 female 처리

  await updateJob({ progress: 5 });
  console.log(`[QuickModel] Starting job ${job.id} (gender=${gender})`);

  if (!objectImageKey) throw new Error("Missing object_image_key");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  // ── 제품 이미지 R2 다운로드 ───────────────────────────────────────────────
  await updateJob({ progress: 15 });
  const objectBuf = await downloadR2(objectImageKey);
  const resizedBuf = await resizeForApi(objectBuf, 1024);
  console.log(`[QuickModel] Product image downloaded and resized (${resizedBuf.length} bytes)`);

  await updateJob({ progress: 30 });
  const genderLine = gender === "male" ? "모델은 남자로 해줘." : "모델은 여자로 해줘.";
  const prompt = QUICK_MODEL_PROMPT + " " + genderLine;
  console.log(`[QuickModel] Using fixed prompt with gender prefix`);

  // ── GPT Image 2 호출 ──────────────────────────────────────────────────────
  await updateJob({ progress: 40 });
  const resultBuffer = await callGptImage2Edit(prompt, [resizedBuf], "1024x1024");
  console.log(`[QuickModel] GPT Image 2 call complete (${resultBuffer.length} bytes)`);

  // ── 워터마크 ─────────────────────────────────────────────────────────────
  await updateJob({ progress: 85 });
  const wmBrandId = job.brand_id ?? job.payload?.brand_id ?? null;
  const resultBufferFinal = await applyWatermarkIfNeeded(supabase, wmBrandId, resultBuffer);

  // ── sharp 후처리 (1000x1000 JPEG) ────────────────────────────────────────
  const sharp = (await import("sharp")).default;
  const processedBuffer = await sharp(resultBufferFinal)
    .resize(1000, 1000)
    .jpeg({ quality: 90 })
    .toBuffer();

  // ── R2 업로드 ─────────────────────────────────────────────────────────────
  const resultKey = `render/quick_model/${job.id}.jpg`;
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: resultKey, Body: processedBuffer, ContentType: "image/jpeg" }));
  console.log(`[QuickModel] R2 upload done: ${resultKey}`);

  // ── Assets 저장 ───────────────────────────────────────────────────────────
  const brandId = job.brand_id ?? job.payload?.brand_id;
  let savedAssetId = null;
  if (brandId) {
    const { data: assetRow, error: assetErr } = await supabase
      .from("assets")
      .insert({
        brand_id: brandId,
        job_id: job.id,
        kind: "render_quick_model",
        r2_key: resultKey,
        product_id: payload.product_id ?? null,
      })
      .select("id")
      .single();
    if (assetErr) {
      console.error(`[QuickModel] assets insert failed:`, assetErr.message);
    } else {
      savedAssetId = assetRow?.id ?? null;
    }
  }

  await updateJob({
    status: "succeeded",
    progress: 100,
    result: {
      type: "render_quick_model",
      result_key: resultKey,
      asset_id: savedAssetId,
    },
  });

  console.log(`[QuickModel] Job ${job.id} completed.`);
}

async function buildProductScenePrompt(userPrompt, styleData, systemPrompt = PRODUCT_SCENE_BUILD_SYSTEM_PROMPT) {
  if (!GEMINI_API_KEY) {
    console.warn("[ProductSceneBuilder] GEMINI_API_KEY not set, using raw prompt");
    return userPrompt;
  }

  const model = process.env.VISION_MODEL ?? "gemini-3.1-flash-lite-preview";

  const styleLines = [];
  if (styleData) {
    if (styleData.mood_keywords?.length)
      styleLines.push(`Mood: ${styleData.mood_keywords.slice(0, 5).join(", ")}`);
    if (styleData.prop_keywords?.length)
      styleLines.push(`Must include in scene: ${styleData.prop_keywords.slice(0, 5).join(", ")}`);
    const sc = styleData.scene ?? {};
    if (sc.background?.trim()) {
      const depthMap = { flat: "flat background", shallow: "shallow space", deep: "deep space" };
      const scParts = [sc.background.trim()];
      if (sc.depth) scParts.push(depthMap[sc.depth] ?? sc.depth);
      styleLines.push(`Scene: ${scParts.join(", ")}`);
    }
    const l = styleData.lighting ?? {};
    const contrastMap = { soft: "soft", medium: "balanced", hard: "dramatic" };
    const sourceMap = { natural: "natural", studio: "studio", mixed: "mixed" };
    const dirMap = { front: "front", side: "side", back: "backlit", top: "overhead" };
    const tempMap = { warm: "warm", neutral: "neutral", cool: "cool" };
    const lParts = [];
    if (l.source) {
      const prefix = l.contrast ? `${contrastMap[l.contrast] ?? l.contrast} ` : "";
      lParts.push(`${prefix}${sourceMap[l.source] ?? l.source} lighting`);
    } else if (l.contrast) {
      lParts.push(`${contrastMap[l.contrast] ?? l.contrast} lighting`);
    }
    if (l.direction) lParts.push(`${dirMap[l.direction] ?? l.direction} light`);
    if (l.color_temperature) lParts.push(`${tempMap[l.color_temperature] ?? l.color_temperature} color temperature`);
    if (lParts.length) styleLines.push(`Lighting: ${lParts.join(", ")}`);
    const cp = styleData.color_palette ?? {};
    if (cp.dominant) styleLines.push(`Background color tone: ${cp.dominant}${cp.accent ? `, accent: ${cp.accent}` : ""}`);
  }

  const styleSection = styleLines.length
    ? `Style guide (PRIMARY — apply all properties as the core visual direction):\n${styleLines.join("\n")}`
    : "";
  const userSection = userPrompt?.trim()
    ? `User prompt (layer on top of style, do not override style properties): ${userPrompt.trim()}`
    : "No user prompt provided. Build the scene entirely from the style guide.";

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 250,
        },
        contents: [{
          role: "user",
          parts: [{ text: styleSection + "\n\n" + userSection }],
        }],
      }),
      60_000,
      "Gemini generateContent (ProductSceneBuilder)"
    );

    const content = response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!content) {
      console.warn("[ProductSceneBuilder] Gemini returned empty response, using raw prompt");
      return userPrompt;
    }

    console.log(`[ProductSceneBuilder] Generated scene prompt (${content.length} chars)`);
    return content;
  } catch (e) {
    console.warn(`[ProductSceneBuilder] Gemini failed: ${e.message}, using raw prompt`);
    return userPrompt;
  }
}

/** 사물용 Vision 분석 — OBJECT_VISION_SYSTEM_PROMPT 사용 */
async function analyzeObjectStyleImage(imageB64, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const model = process.env.VISION_MODEL ?? "gemini-3.1-flash-lite-preview";
  const userMessage = userPrompt ? `User instructions: ${userPrompt}` : "No additional instructions.";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: OBJECT_VISION_SYSTEM_PROMPT },
            { inlineData: { mimeType: "image/jpeg", data: imageB64 } },
            { text: userMessage },
          ],
        },
      ],
      config: { maxOutputTokens: 300 },
    }),
    60_000,
    "Gemini generateContent (analyzeObjectStyleImage)"
  );

  const content = response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join("")
    .trim();
  if (!content) {
    const err = new Error("Gemini Vision returned empty response for object style");
    err.status = 502;
    throw err;
  }

  console.log(`[RenderObject] Vision prompt (${content.length} chars)`);
  return content;
}

// ---------------------------------------------------------------------------
// Pipeline: Influencer + Product (render_product_model)
// ---------------------------------------------------------------------------
const PRODUCT_VISION_SYSTEM_PROMPT = `Task: Analyze this example image showing a person with a product. Write a scene description prompt.

Critical rules:
- Do NOT describe the person's face, facial identity, or facial features. The face comes from a separate reference.
- Do NOT describe the person's hair, hairstyle, hair length, bangs, hair texture, or hair color. The hair comes from a separate reference.
- Do NOT mention gender. Refer to the subject only as "a person" or "the subject".
- Do NOT describe the product's brand, label, text, or specific identity.
- Do NOT ask follow-up questions.

Step order:
1. Analyze the scene, environment, and background.
2. Analyze how the person is interacting with the product (holding, using, applying, drinking, etc.).
3. Analyze the camera angle, distance, framing, and composition.
4. Analyze the lighting, mood, and atmosphere.
5. Merge the user's instructions naturally.
6. Write one continuous paragraph, 80-200 words.

Edge cases:
- If no user instructions, base the prompt entirely on the image.
- If user instructions conflict with the image, prefer user instructions.

Output packaging:
- One paragraph, 80-200 words.
- No bullet points, no headers, no quotes, no markdown.
- No preamble, no commentary, no follow-up questions.`;

function buildProductPrompt(scenePrompt, hasStyleSheet = false) {
  const styleSheetLine = hasStyleSheet
    ? `\nImage 3 is a visual style reference sheet (color palette swatches and prop elements). Use Image 3 as a reference only — do NOT reproduce the color swatches or reference sheet layout in the output. Apply only the color mood and palette to the overall scene lighting and atmosphere.`
    : "";
  return `Image 1 is a face pose sheet showing the same person from multiple angles.
Image 2 is the exact product that the person must hold or use.${styleSheetLine}

Generate a photorealistic photo of the person from image 1 holding or using the exact product from image 2.
Natural iPhone-style photo texture and quality.

Identity rules:
- The person's face, hair, and overall identity must come from image 1.
- Do not invent a new person or blend identities.

Product rules:
- The product must be the exact product from image 2 — same shape, packaging, label, text, logo, colors, and design.
- Faithfully reproduce the product's material and surface texture from image 2: glass, plastic, metal, matte, glossy, frosted, brushed, transparent, fabric, leather, ceramic, etc.
- Preserve the product's reflectivity, sheen, and tactile quality as seen in image 2.
- Preserve every letter, word, and character on the product exactly as shown in image 2.
- Do not simplify, omit, or rearrange any text or logo on the product.
- The product must be realistically sized relative to the person's hands and body.
- The product should be clearly visible and prominent in the frame.

The image must feature only one main subject — the person from image 1.

Scene description:
${scenePrompt}`;
}

async function analyzeProductExampleImage(imageB64, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.VISION_MODEL ?? "gemini-3.1-flash-lite-preview";
  const userMessage = userPrompt ? `User instructions: ${userPrompt}` : "No additional instructions.";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [
        { text: PRODUCT_VISION_SYSTEM_PROMPT },
        { inlineData: { mimeType: "image/jpeg", data: imageB64 } },
        { text: userMessage },
      ]}],
      config: { maxOutputTokens: 300 },
    }),
    60_000,
    "Gemini generateContent (analyzeProductExampleImage)"
  );

  const content = response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text).filter(Boolean).join("").trim();
  if (!content) {
    const err = new Error("Gemini Vision returned empty response for product scene");
    err.status = 502;
    throw err;
  }
  console.log(`[RenderProduct] Vision prompt (${content.length} chars)`);
  return content;
}

async function processRenderInfluencerProductJob(job) {
  const nowIso = () => new Date().toISOString();
  const updateJob = async (fields) => {
    await supabase.from("jobs").update({ ...fields, updated_at: nowIso() }).eq("id", job.id);
  };

  const payload = job.payload ?? {};
  const faceSheetKey = payload.face_sheet_key;
  const productImageKey = payload.product_image_key;
  let userPrompt = payload.prompt ?? "";
  const influencerId = payload.influencer_id;
  const aspectRatio = payload.aspect_ratio ?? "1:1";

  if (!faceSheetKey || !productImageKey) throw new Error("Missing face_sheet_key or product_image_key");

  const XAI_API_KEY = process.env.XAI_API_KEY ?? "";
  if (!XAI_API_KEY) throw new Error("XAI_API_KEY not set");

  await updateJob({ progress: 5 });
  console.log(`[RenderProduct] Starting job ${job.id}`);

  // ── 스타일 데이터 조회 ────────────────────────────────────────────────
  let styleData = null;
  if (payload.style_id) {
    const { data, error: styleErr } = await supabase
      .from("styles")
      .select("mood_keywords, prop_keywords, scene, lighting, color_palette, style_sheet_url")
      .eq("id", payload.style_id)
      .single();
    if (styleErr) console.warn(`[RenderProduct] Style fetch error: ${styleErr.message}`);
    if (data) {
      styleData = data;
      console.log(`[RenderProduct] Style loaded: ${payload.style_id}`);
    }
  }

  // ── 이미지 다운로드 ───────────────────────────────────────────────────
  await updateJob({ progress: 10 });

  const [faceSheetBuf, productBuf] = await Promise.all([
    downloadR2(faceSheetKey),
    downloadR2(productImageKey),
  ]);
  const faceSheetB64 = faceSheetBuf.toString("base64");
  const productB64 = productBuf.toString("base64");
  const productMimeType = /\.(jpg|jpeg)$/i.test(productImageKey) ? "image/jpeg" : "image/png";

  // ── Quick auto-match: 카테고리 + 포맷 후보군 중 Vision 선택 ──────────────
  // (object 파이프라인과 동일한 패턴: 매칭 성공 시 scenePrompt를 userPrompt로 치환,
  //  실패/예외 시 형식별 fallback prompt 사용)
  let selectedPatternKey = null;
  if (payload.auto_match && payload.category && payload.mood_format) {
    await updateJob({ progress: 15 });
    const fallbackByFormat = {
      mood: "Lifestyle product shot with mood-evoking environment, soft natural light, refined editorial composition.",
      model: "Lifestyle product shot featuring a person interacting with the item, soft natural light, candid editorial composition.",
    };
    try {
      const matchResult = await selectQuickPattern({
        imageBuffer: productBuf,
        mimeType: productMimeType,
        category: payload.category,
        format: payload.mood_format,
      });
      if (matchResult?.pattern) {
        userPrompt = matchResult.pattern.scenePrompt;
        selectedPatternKey = matchResult.pattern.key;
        console.log(`[RenderProduct] Auto-matched pattern: ${selectedPatternKey}`);
      } else {
        userPrompt = fallbackByFormat[payload.mood_format] ?? userPrompt;
        console.warn(`[RenderProduct] Pattern matching failed, using fallback prompt for ${payload.mood_format}`);
      }
    } catch (e) {
      userPrompt = fallbackByFormat[payload.mood_format] ?? userPrompt;
      console.warn(`[RenderProduct] Pattern matching failed (non-fatal): ${e.message}`);
    }
  }

  // ── Scene prompt 생성 (Gemini: 유저 프롬프트 1순위 + 스타일 2순위) ───
  const scenePrompt = await buildProductScenePrompt(userPrompt, styleData, PERSON_PRODUCT_SCENE_BUILD_SYSTEM_PROMPT);
  console.log(`[RenderProduct] Scene prompt: ${scenePrompt.substring(0, 100)}...`);

  // ── Props 강제 지시 ───────────────────────────────────────────────────
  const propKeywords = styleData?.prop_keywords?.filter(Boolean) ?? [];
  const propHint = propKeywords.length
    ? `\n\nThe following props MUST appear visibly in the scene: ${propKeywords.join(", ")}.`
    : "";

  // ── Grok 생성 ──────────────────────────────────────────────────────
  await updateJob({ progress: 25 });

  // ── Style sheet 다운로드 및 리사이즈 (public R2 URL) ─────────────────
  let styleSheetResizedProd = null;
  const styleSheetUrlProd = toR2PublicUrl(styleData?.style_sheet_url);
  if (styleSheetUrlProd) {
    try {
      const ssResp = await fetch(styleSheetUrlProd, { signal: AbortSignal.timeout(30_000) });
      if (!ssResp.ok) throw new Error(`HTTP ${ssResp.status}`);
      const ssRaw = Buffer.from(await ssResp.arrayBuffer());
      styleSheetResizedProd = await resizeForApi(ssRaw, 1024);
      console.log(`[RenderProduct] Style sheet downloaded and resized (${styleSheetResizedProd.length} bytes)`);
    } catch (e) {
      console.warn(`[RenderProduct] Style sheet download failed (non-fatal): ${e.message}`);
      styleSheetResizedProd = null;
    }
  }

  const hasStyleSheet = styleSheetResizedProd !== null;
  const fullPrompt = buildProductPrompt(scenePrompt, hasStyleSheet) + propHint;
  console.log(`[RenderProduct] Generating via Grok (style_sheet=${hasStyleSheet})...`);

  const [fsResized, pdResized] = await Promise.all([
    resizeForApi(faceSheetBuf),
    resizeForApi(productBuf),
  ]);

  // Grok images 배열: style_sheet 있으면 3장, 없으면 2장
  const grokImages = hasStyleSheet
    ? [
        { type: "image_url", url: `data:image/jpeg;base64,${fsResized.toString("base64")}` },
        { type: "image_url", url: `data:image/jpeg;base64,${pdResized.toString("base64")}` },
        { type: "image_url", url: `data:image/jpeg;base64,${styleSheetResizedProd.toString("base64")}` },
      ]
    : [
        { type: "image_url", url: `data:image/jpeg;base64,${fsResized.toString("base64")}` },
        { type: "image_url", url: `data:image/jpeg;base64,${pdResized.toString("base64")}` },
      ];

  const grokModel = process.env.GROK_IMAGE_MODEL ?? "grok-imagine-image";

  const imageApi = payload.image_api ?? "gpt"; // "grok" | "gpt"

  const gptImagesForProduct = [fsResized, pdResized, ...(styleSheetResizedProd ? [styleSheetResizedProd] : [])];

  let resultBuffer = null;

  if (imageApi === "grok") {
    resultBuffer = await withRetry(async () => {
      console.log(`[RenderProduct] Grok calling...`);
      const resp = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${XAI_API_KEY}` },
        body: JSON.stringify({
          model: grokModel, prompt: fullPrompt, n: 1, resolution: "2k",
          aspect_ratio: aspectRatio,
          images: grokImages,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw Object.assign(new Error(`xAI ${resp.status}: ${errText.substring(0, 200)}`), { status: resp.status });
      }
      const data = await resp.json();
      const b64 = data.data?.[0]?.b64_json;
      const imgUrl = data.data?.[0]?.url;
      if (b64) return Buffer.from(b64, "base64");
      if (imgUrl) { const dl = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) }); if (dl.ok) return Buffer.from(await dl.arrayBuffer()); }
      console.warn(`[RenderProduct] Grok: no image in response`);
      const err = new Error("Grok returned no image");
      err.status = 502;
      throw err;
    });
  } else {
    resultBuffer = await callGptImage2Edit(fullPrompt, gptImagesForProduct, aspectRatio);
  }

  await updateJob({ progress: 85 });

  const resultKey = imageApi === "grok"
    ? `render/${influencerId}/${job.id}_product_a.png`
    : `render/${influencerId}/${job.id}_product_gpt.png`;

  const wmBrandId = job.brand_id ?? job.payload?.brand_id ?? null;
  const finalBuffer = await applyWatermarkIfNeeded(supabase, wmBrandId, resultBuffer);
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: resultKey, Body: finalBuffer, ContentType: "image/png" }));

  // ── Assets 저장 (asset_id를 result에 포함시키기 위해 update보다 먼저) ──
  const brandId = job.brand_id ?? job.payload?.brand_id;
  let savedAssetId = null;
  if (brandId) {
    const { data: assetRow, error: assetErr } = await supabase
      .from("assets")
      .insert({
        brand_id: brandId,
        job_id: job.id,
        kind: "render_product_model",
        r2_key: resultKey,
        model_id: job.payload?.influencer_id ?? null,
        product_id: job.payload?.product_id ?? null,
        style_id: job.payload?.style_id ?? null,
      })
      .select("id")
      .single();
    if (assetErr) {
      console.error(`[RenderProduct] assets insert failed:`, assetErr.message);
    } else {
      savedAssetId = assetRow?.id ?? null;
    }
  }

  await updateJob({
    status: "succeeded",
    progress: 100,
    result: {
      type: "render_product_model",
      result_key: resultKey,
      ...(imageApi === "grok" ? { grok_key: resultKey } : { gpt_key: resultKey }),
      final_prompt: fullPrompt,
      asset_id: savedAssetId,
      selected_pattern_key: selectedPatternKey,
    },
  });

  console.log(`[RenderProduct] Job ${job.id} completed. api=${imageApi}`);
}

async function processJob(job) {
  const payload = job.payload ?? {};
  if (payload.kind === "persona") {
    await processModelJob(job);
    return;
  }
  /* [DISABLED - render_outfit legacy]
  if (payload.kind === "render_outfit") {
    await processRenderJob(job);
    return;
  }
  [DISABLED - render_outfit legacy] */
  if (payload.kind === "render_prompt") {
    await processRenderGrokJob(job);
    return;
  }
  if (payload.kind === "render_product_solo") {
    await processRenderObjectJob(job);
    return;
  }
  if (payload.kind === "render_quick_mood") {
    await processRenderQuickMoodJob(job);
    return;
  }
  if (payload.kind === "render_quick_model") {
    await processRenderQuickModelJob(job);
    return;
  }
  if (payload.kind === "render_product_model") {
    await processRenderInfluencerProductJob(job);
    return;
  }
  throw new Error(`Unsupported job kind: ${payload.kind ?? "(default)"}`);
}

async function runOneFullCycle() {
  const jobs = [];
  for (let i = 0; i < WORKER_CONCURRENCY; i++) {
    const job = await claimJob();
    if (!job) break;
    jobs.push(job);
  }
  await Promise.all(
    jobs.map(async (job) => {
      try {
        await processJob(job);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Worker failed";
        await markJobFailed(job.id, message, job.credit_ledger_id ?? null);
      }
    }),
  );
}

/** WORKER_CONCURRENCY 수만큼 잡을 병렬 처리. HTTP 서버(Cron 트리거)에서 사용. */
export async function runOneCycle() {
  await requeueStaleProcessingJobs();
  const jobs = [];
  for (let i = 0; i < WORKER_CONCURRENCY; i++) {
    const job = await claimJob();
    if (!job) break;
    jobs.push(job);
  }
  await Promise.all(
    jobs.map(async (job) => {
      try {
        await processJob(job);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Worker failed";
        await markJobFailed(job.id, message, job.credit_ledger_id ?? null);
      }
    }),
  );
}

const staleRequeueIntervalMs = 10 * 60 * 1000; // 10분마다 오래된 processing 재큐

async function run() {
  console.log("Worker started");
  console.log("Generator base URL:", generatorBaseUrl);
  console.log("Job source filter:", jobSource);
  console.log("Worker concurrency:", WORKER_CONCURRENCY);
  await requeueStaleProcessingJobs();
  let lastRequeue = Date.now();
  while (true) {
    await runOneFullCycle();
    if (Date.now() - lastRequeue >= staleRequeueIntervalMs) {
      await requeueStaleProcessingJobs();
      lastRequeue = Date.now();
    }
    await sleep(5000);
  }
}

// WORKER_HTTP_PORT 또는 PORT(Railway 등)가 있으면 HTTP 서버만 띄움 (Vercel Cron → GET /run 호출용). 없으면 폴링 루프.
// WORKER_POLLING_MODE=true 이면 PORT가 있어도 폴링 루프를 백그라운드로 함께 실행 (Railway에서 상시 폴링용).
const httpPort = Number(process.env.WORKER_HTTP_PORT || process.env.PORT || "0");
const pollingMode = process.env.WORKER_POLLING_MODE === "true" || process.env.WORKER_POLLING_MODE === "1";

const workerCronSecret = process.env.WORKER_CRON_SECRET ?? process.env.CRON_SECRET ?? "";

function requireRunAuth(req, res) {
  if (!workerCronSecret) return true;
  const auth = req.headers?.authorization;
  if (auth === `Bearer ${workerCronSecret}`) return true;
  res.writeHead(401, { "Content-Type": "text/plain" });
  res.end("Unauthorized");
  return false;
}

if (httpPort > 0) {
  const http = await import("http");
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split("?")[0] ?? "";
    if (url === "/run" || url === "/") {
      if (!requireRunAuth(req, res)) return;
      try {
        await runOneCycle();
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      } catch (e) {
        console.error(e);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(e instanceof Error ? e.message : "error");
      }
    } else if (url === "/health" || url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(httpPort, "0.0.0.0", () => {
    console.log(`Worker HTTP on port ${httpPort} (GET /run = one cycle, GET /health = health check)`);
    if (pollingMode) {
      console.log("WORKER_POLLING_MODE=true: background polling loop started");
      run().catch((e) => {
        console.error("Worker polling loop error:", e);
      });
    }
  });
} else {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
