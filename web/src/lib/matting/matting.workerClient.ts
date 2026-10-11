/**
 * matting.workerClient.ts — HTTP client for the Python matting worker.
 *
 * Worker base URL: MATTING_WORKER_URL (default http://localhost:8500)
 * Timeout: 10 min (matting + export can be lengthy)
 */

import type { MattingWorkerRequest, MattingWorkerResponse } from "@/lib/matting/matting.types";

const MATTING_WORKER_URL = (process.env.MATTING_WORKER_URL ?? "http://localhost:8500").replace(/\/$/, "");
const TIMEOUT_MS = 10 * 60 * 1000;

async function post(endpoint: string, body: MattingWorkerRequest): Promise<MattingWorkerResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${MATTING_WORKER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Matting worker ${endpoint} → ${res.status}: ${detail}`);
    }
    return (await res.json()) as MattingWorkerResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export function prepareMatting(params: {
  jobId: string;
  fusedCharacterUrl: string;
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  alphaFormat: string;
  edgeSoftness: number;
  hairDetailStrength: number;
  spillSuppressionStrength: number;
  temporalSmoothingStrength: number;
  outputR2Key: string;
}): Promise<MattingWorkerResponse> {
  return post("/prepare", {
    input_url: params.fusedCharacterUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {
      fps: params.fps,
      width: params.width,
      height: params.height,
      duration_sec: params.durationSec,
      alpha_format: params.alphaFormat,
      edge_softness: params.edgeSoftness,
      hair_detail_strength: params.hairDetailStrength,
      spill_suppression_strength: params.spillSuppressionStrength,
      temporal_smoothing_strength: params.temporalSmoothingStrength,
    },
  });
}

export function generateMatte(params: {
  jobId: string;
  preparedInputUrl: string;
  outputR2Key: string;
  alphaFormat: string;
  edgeSoftness: number;
  hairDetailStrength: number;
  spillSuppressionStrength: number;
  temporalSmoothingStrength: number;
  width: number;
  height: number;
  fps: number;
}): Promise<MattingWorkerResponse> {
  return post("/generate", {
    input_url: params.preparedInputUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {
      alpha_format: params.alphaFormat,
      edge_softness: params.edgeSoftness,
      hair_detail_strength: params.hairDetailStrength,
      spill_suppression_strength: params.spillSuppressionStrength,
      temporal_smoothing_strength: params.temporalSmoothingStrength,
      width: params.width,
      height: params.height,
      fps: params.fps,
    },
  });
}

export function validateMatting(params: {
  jobId: string;
  foregroundAlphaUrl: string;
  outputR2Key: string;
}): Promise<MattingWorkerResponse> {
  return post("/validate", {
    input_url: params.foregroundAlphaUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {},
  });
}

export function retryMatting(params: {
  jobId: string;
  preparedInputUrl: string;
  outputR2Key: string;
  alphaFormat: string;
  edgeSoftness: number;
  hairDetailStrength: number;
  spillSuppressionStrength: number;
  temporalSmoothingStrength: number;
  width: number;
  height: number;
  fps: number;
  retryReason: string;
}): Promise<MattingWorkerResponse> {
  return post("/retry", {
    input_url: params.preparedInputUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {
      alpha_format: params.alphaFormat,
      edge_softness: params.edgeSoftness,
      hair_detail_strength: params.hairDetailStrength,
      spill_suppression_strength: params.spillSuppressionStrength,
      temporal_smoothing_strength: params.temporalSmoothingStrength,
      width: params.width,
      height: params.height,
      fps: params.fps,
      retry_reason: params.retryReason,
    },
  });
}
