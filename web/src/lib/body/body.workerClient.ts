/**
 * body.workerClient.ts — Python Body Worker HTTP 클라이언트
 *
 * 환경 변수:
 *   BODY_WORKER_URL — Python FastAPI 워커 base URL
 *                     예: http://localhost:8200
 *                         https://my-body-worker.modal.run
 */

import type { BodyWorkerRequest, BodyWorkerResponse } from "@/lib/body/body.types";

const MAX_RETRIES = 2;
const TIMEOUT_MS = 300_000; // 5분 — body generation은 시간이 걸린다

function getWorkerUrl(): string {
  const url = process.env.BODY_WORKER_URL?.trim();
  if (!url) throw new Error("BODY_WORKER_URL is not configured");
  return url.replace(/\/$/, "");
}

async function callWorkerEndpoint(
  endpoint: string,
  payload: BodyWorkerRequest
): Promise<BodyWorkerResponse> {
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
        throw new Error(`Body worker /${endpoint} responded ${res.status}: ${text}`);
      }

      return (await res.json()) as BodyWorkerResponse;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[body-worker] /${endpoint} attempt ${attempt + 1} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Body worker /${endpoint} failed after ${MAX_RETRIES + 1} attempts: ${msg}`);
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/** Step 3+4: Download canonical set, analyze orientations, load pose data */
export async function prepareBodyInputs(opts: {
  jobId: string;
  c1Url: string;
  c2Url: string;
  c3Url: string;
  poseDataUrl: string;
  bboxTimelineUrl?: string | null;
  footContactJsonUrl?: string | null;
  width: number;
  height: number;
}): Promise<BodyWorkerResponse> {
  return callWorkerEndpoint("prepare", {
    input_url: opts.c1Url,
    job_id: opts.jobId,
    options: {
      c2_url: opts.c2Url,
      c3_url: opts.c3Url,
      pose_data_url: opts.poseDataUrl,
      bbox_timeline_url: opts.bboxTimelineUrl ?? null,
      foot_contact_url: opts.footContactJsonUrl ?? null,
      width: opts.width,
      height: opts.height,
    },
  });
}

/** Step 6: Generate body pass video */
export async function generateBodyPass(opts: {
  jobId: string;
  preparedInputsUrl: string;
  routingPlanJson: unknown;
  bodyGenerationModel: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  motionStrictness: number;
  identityPreserveStrength: number;
  clothDetailStrength: number;
}): Promise<BodyWorkerResponse> {
  return callWorkerEndpoint("generate", {
    input_url: opts.preparedInputsUrl,
    job_id: opts.jobId,
    options: {
      routing_plan: opts.routingPlanJson,
      body_generation_model: opts.bodyGenerationModel,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      motion_strictness: opts.motionStrictness,
      identity_preserve_strength: opts.identityPreserveStrength,
      cloth_detail_strength: opts.clothDetailStrength,
    },
  });
}

/** Step 7: Quality validation */
export async function validateBodyPass(opts: {
  jobId: string;
  bodyPassUrl: string;
  poseDataUrl: string;
  footContactJsonUrl?: string | null;
  fps: number;
}): Promise<BodyWorkerResponse> {
  return callWorkerEndpoint("validate", {
    input_url: opts.bodyPassUrl,
    job_id: opts.jobId,
    options: {
      pose_data_url: opts.poseDataUrl,
      foot_contact_url: opts.footContactJsonUrl ?? null,
      fps: opts.fps,
    },
  });
}

/** Step 8: Retry with adjusted parameters */
export async function retryBodyPass(opts: {
  jobId: string;
  preparedInputsUrl: string;
  routingPlanJson: unknown;
  bodyGenerationModel: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  motionStrictness: number;
  identityPreserveStrength: number;
  clothDetailStrength: number;
  retryReason: string;
}): Promise<BodyWorkerResponse> {
  return callWorkerEndpoint("retry", {
    input_url: opts.preparedInputsUrl,
    job_id: opts.jobId,
    options: {
      routing_plan: opts.routingPlanJson,
      body_generation_model: opts.bodyGenerationModel,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      motion_strictness: opts.motionStrictness,
      identity_preserve_strength: opts.identityPreserveStrength,
      cloth_detail_strength: opts.clothDetailStrength,
      retry_reason: opts.retryReason,
    },
  });
}
