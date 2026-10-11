/**
 * face.workerClient.ts — Python Face Worker HTTP 클라이언트
 *
 * 환경 변수:
 *   FACE_WORKER_URL — Python FastAPI 워커 base URL
 *                     예: http://localhost:8300
 *                         https://my-face-worker.modal.run
 */

import type { FaceWorkerRequest, FaceWorkerResponse } from "@/lib/face/face.types";

const MAX_RETRIES = 2;
const TIMEOUT_MS = 300_000; // 5분

function getWorkerUrl(): string {
  const url = process.env.FACE_WORKER_URL?.trim();
  if (!url) throw new Error("FACE_WORKER_URL is not configured");
  return url.replace(/\/$/, "");
}

async function callWorkerEndpoint(
  endpoint: string,
  payload: FaceWorkerRequest
): Promise<FaceWorkerResponse> {
  const url = `${getWorkerUrl()}/${endpoint}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Face worker /${endpoint} responded ${res.status}: ${text}`);
      }

      return (await res.json()) as FaceWorkerResponse;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[face-worker] /${endpoint} attempt ${attempt + 1} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Face worker /${endpoint} failed after ${MAX_RETRIES + 1} attempts: ${msg}`);
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/** Step 3: Resolve face master — detect, crop, extract landmarks */
export async function resolveFaceAssets(opts: {
  jobId: string;
  faceMasterUrl: string;
  width: number;
  height: number;
}): Promise<FaceWorkerResponse> {
  return callWorkerEndpoint("resolve", {
    input_url: opts.faceMasterUrl,
    job_id: opts.jobId,
    options: { width: opts.width, height: opts.height },
  });
}

/** Step 4+5: Load face signal, apply smoothing/strength overrides, prepare driving inputs */
export async function prepareFaceSignal(opts: {
  jobId: string;
  faceSignalUrl: string;
  faceBboxTimelineUrl?: string | null;
  faceMasterInfoUrl: string;
  fps: number;
  durationSec: number;
  identityPreserveStrength: number;
  expressionStrength: number;
  mouthStrength: number;
  eyeRetargetStrength: number;
  signalSmoothingStrength: number;
}): Promise<FaceWorkerResponse> {
  return callWorkerEndpoint("prepare-signal", {
    input_url: opts.faceSignalUrl,
    job_id: opts.jobId,
    options: {
      face_bbox_timeline_url: opts.faceBboxTimelineUrl ?? null,
      face_master_info_url: opts.faceMasterInfoUrl,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      identity_preserve_strength: opts.identityPreserveStrength,
      expression_strength: opts.expressionStrength,
      mouth_strength: opts.mouthStrength,
      eye_retarget_strength: opts.eyeRetargetStrength,
      signal_smoothing_strength: opts.signalSmoothingStrength,
    },
  });
}

/** Step 6: Generate face pass video */
export async function generateFacePass(opts: {
  jobId: string;
  preparedSignalUrl: string;
  faceMasterUrl: string;
  faceGenerationModel: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  identityPreserveStrength: number;
  expressionStrength: number;
  mouthStrength: number;
  eyeRetargetStrength: number;
}): Promise<FaceWorkerResponse> {
  return callWorkerEndpoint("generate", {
    input_url: opts.preparedSignalUrl,
    job_id: opts.jobId,
    options: {
      face_master_url: opts.faceMasterUrl,
      face_generation_model: opts.faceGenerationModel,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      identity_preserve_strength: opts.identityPreserveStrength,
      expression_strength: opts.expressionStrength,
      mouth_strength: opts.mouthStrength,
      eye_retarget_strength: opts.eyeRetargetStrength,
    },
  });
}

/** Step 7: Quality validation */
export async function validateFacePass(opts: {
  jobId: string;
  facePassUrl: string;
  faceMasterUrl: string;
  preparedSignalUrl: string;
  fps: number;
}): Promise<FaceWorkerResponse> {
  return callWorkerEndpoint("validate", {
    input_url: opts.facePassUrl,
    job_id: opts.jobId,
    options: {
      face_master_url: opts.faceMasterUrl,
      prepared_signal_url: opts.preparedSignalUrl,
      fps: opts.fps,
    },
  });
}

/** Step 8: Retry with adjusted parameters */
export async function retryFacePass(opts: {
  jobId: string;
  preparedSignalUrl: string;
  faceMasterUrl: string;
  faceGenerationModel: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  identityPreserveStrength: number;
  expressionStrength: number;
  mouthStrength: number;
  eyeRetargetStrength: number;
  retryReason: string;
}): Promise<FaceWorkerResponse> {
  return callWorkerEndpoint("retry", {
    input_url: opts.preparedSignalUrl,
    job_id: opts.jobId,
    options: {
      face_master_url: opts.faceMasterUrl,
      face_generation_model: opts.faceGenerationModel,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      identity_preserve_strength: opts.identityPreserveStrength,
      expression_strength: opts.expressionStrength,
      mouth_strength: opts.mouthStrength,
      eye_retarget_strength: opts.eyeRetargetStrength,
      retry_reason: opts.retryReason,
    },
  });
}
