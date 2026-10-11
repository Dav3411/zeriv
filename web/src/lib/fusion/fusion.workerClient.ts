/**
 * fusion.workerClient.ts — Python Fusion Worker HTTP 클라이언트
 *
 * 환경 변수:
 *   FUSION_WORKER_URL — Python FastAPI 워커 base URL
 *                       예: http://localhost:8400
 */

import type { FusionWorkerRequest, FusionWorkerResponse } from "@/lib/fusion/fusion.types";

const MAX_RETRIES = 1; // fusion은 무거우므로 retry 횟수 줄임
const TIMEOUT_MS = 600_000; // 10분 — 전체 파이프라인

function getWorkerUrl(): string {
  const url = process.env.FUSION_WORKER_URL?.trim();
  if (!url) throw new Error("FUSION_WORKER_URL is not configured");
  return url.replace(/\/$/, "");
}

async function callWorkerEndpoint(
  endpoint: string,
  payload: FusionWorkerRequest
): Promise<FusionWorkerResponse> {
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
        throw new Error(`Fusion worker /${endpoint} responded ${res.status}: ${text}`);
      }

      return (await res.json()) as FusionWorkerResponse;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[fusion-worker] /${endpoint} attempt ${attempt + 1} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Fusion worker /${endpoint} failed after ${MAX_RETRIES + 1} attempts: ${msg}`);
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Full fusion pipeline: align → place → mask → fuse → stabilize → output
 * input_url = body_pass URL; face_pass and bbox timeline in options
 */
export async function runFusion(opts: {
  jobId: string;
  bodyPassUrl: string;
  facePassUrl: string;
  faceBboxTimelineUrl?: string | null;
  faceMasterInfoUrl?: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  faceBlendStrength: number;
  skinToneMatchStrength: number;
  hairlineSoftness: number;
  neckBlendStrength: number;
  placementSmoothingStrength: number;
}): Promise<FusionWorkerResponse> {
  return callWorkerEndpoint("fuse", {
    input_url: opts.bodyPassUrl,
    job_id: opts.jobId,
    options: {
      face_pass_url: opts.facePassUrl,
      face_bbox_timeline_url: opts.faceBboxTimelineUrl ?? null,
      face_master_info_url: opts.faceMasterInfoUrl ?? null,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      face_blend_strength: opts.faceBlendStrength,
      skin_tone_match_strength: opts.skinToneMatchStrength,
      hairline_softness: opts.hairlineSoftness,
      neck_blend_strength: opts.neckBlendStrength,
      placement_smoothing_strength: opts.placementSmoothingStrength,
    },
  });
}

/** Quality validation of fused video */
export async function validateFusion(opts: {
  jobId: string;
  fusedVideoUrl: string;
  bodyPassUrl: string;
  facePassUrl: string;
}): Promise<FusionWorkerResponse> {
  return callWorkerEndpoint("validate", {
    input_url: opts.fusedVideoUrl,
    job_id: opts.jobId,
    options: {
      body_pass_url: opts.bodyPassUrl,
      face_pass_url: opts.facePassUrl,
    },
  });
}

/** Retry with adjusted parameters */
export async function retryFusion(opts: {
  jobId: string;
  bodyPassUrl: string;
  facePassUrl: string;
  faceBboxTimelineUrl?: string | null;
  faceMasterInfoUrl?: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  faceBlendStrength: number;
  skinToneMatchStrength: number;
  hairlineSoftness: number;
  neckBlendStrength: number;
  placementSmoothingStrength: number;
  retryReason: string;
}): Promise<FusionWorkerResponse> {
  return callWorkerEndpoint("retry", {
    input_url: opts.bodyPassUrl,
    job_id: opts.jobId,
    options: {
      face_pass_url: opts.facePassUrl,
      face_bbox_timeline_url: opts.faceBboxTimelineUrl ?? null,
      face_master_info_url: opts.faceMasterInfoUrl ?? null,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
      face_blend_strength: opts.faceBlendStrength,
      skin_tone_match_strength: opts.skinToneMatchStrength,
      hairline_softness: opts.hairlineSoftness,
      neck_blend_strength: opts.neckBlendStrength,
      placement_smoothing_strength: opts.placementSmoothingStrength,
      retry_reason: opts.retryReason,
    },
  });
}
