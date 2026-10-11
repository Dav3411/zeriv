/**
 * polish.workerClient.ts — HTTP client for the Python polish worker.
 *
 * Worker base URL: POLISH_WORKER_URL (default http://localhost:8700)
 * Timeout: 10 min
 */

import type {
  PolishWorkerRequest,
  PolishWorkerResponse,
} from "@/lib/polish/polish.types";

const POLISH_WORKER_URL = (
  process.env.POLISH_WORKER_URL ?? "http://localhost:8700"
).replace(/\/$/, "");
const TIMEOUT_MS = 10 * 60 * 1000;

async function post(endpoint: string, body: PolishWorkerRequest): Promise<PolishWorkerResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${POLISH_WORKER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Polish worker ${endpoint} → ${res.status}: ${detail}`);
    }
    return (await res.json()) as PolishWorkerResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export function runPolish(params: {
  jobId: string;
  draftCompositeUrl: string;
  audioUrl: string | null;
  width: number;
  height: number;
  fps: number;
  strategy: string;
  artifactReductionStrength: number;
  harmonizationStrength: number;
  lipCorrectionStrength: number;
  textureNaturalnessStrength: number;
  antiPlasticSkinStrength: number;
  enableLipCorrection: boolean;
  outputR2Key: string;
}): Promise<PolishWorkerResponse> {
  return post("/polish", {
    input_url: params.draftCompositeUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {
      audio_url: params.audioUrl ?? null,
      width: params.width,
      height: params.height,
      fps: params.fps,
      strategy: params.strategy,
      artifact_reduction_strength: params.artifactReductionStrength,
      harmonization_strength: params.harmonizationStrength,
      lip_correction_strength: params.lipCorrectionStrength,
      texture_naturalness_strength: params.textureNaturalnessStrength,
      anti_plastic_skin_strength: params.antiPlasticSkinStrength,
      enable_lip_correction: params.enableLipCorrection,
    },
  });
}

export function validatePolishWorker(params: {
  jobId: string;
  polishedUrl: string;
  draftCompositeUrl: string;
  outputR2Key: string;
}): Promise<PolishWorkerResponse> {
  return post("/validate", {
    input_url: params.polishedUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: { draft_composite_url: params.draftCompositeUrl },
  });
}

export function retryPolish(params: {
  jobId: string;
  draftCompositeUrl: string;
  audioUrl: string | null;
  width: number;
  height: number;
  fps: number;
  strategy: string;
  artifactReductionStrength: number;
  harmonizationStrength: number;
  lipCorrectionStrength: number;
  textureNaturalnessStrength: number;
  antiPlasticSkinStrength: number;
  enableLipCorrection: boolean;
  outputR2Key: string;
  retryReason: string;
}): Promise<PolishWorkerResponse> {
  const { retryReason, ...rest } = params;
  return post("/retry", {
    input_url: rest.draftCompositeUrl,
    job_id: rest.jobId,
    output_r2_key: rest.outputR2Key,
    options: {
      audio_url: rest.audioUrl ?? null,
      width: rest.width,
      height: rest.height,
      fps: rest.fps,
      strategy: rest.strategy,
      artifact_reduction_strength: rest.artifactReductionStrength,
      harmonization_strength: rest.harmonizationStrength,
      lip_correction_strength: rest.lipCorrectionStrength,
      texture_naturalness_strength: rest.textureNaturalnessStrength,
      anti_plastic_skin_strength: rest.antiPlasticSkinStrength,
      enable_lip_correction: rest.enableLipCorrection,
      retry_reason: retryReason,
    },
  });
}
