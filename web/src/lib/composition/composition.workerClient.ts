/**
 * composition.workerClient.ts — HTTP client for the Python composition worker.
 *
 * Worker base URL: COMPOSITION_WORKER_URL (default http://localhost:8600)
 * Timeout: 12 min (full frame-wise composition of an 8s clip)
 */

import type {
  CompositionWorkerRequest,
  CompositionWorkerResponse,
} from "@/lib/composition/composition.types";

const COMPOSITION_WORKER_URL = (
  process.env.COMPOSITION_WORKER_URL ?? "http://localhost:8600"
).replace(/\/$/, "");
const TIMEOUT_MS = 12 * 60 * 1000;

async function post(
  endpoint: string,
  body: CompositionWorkerRequest
): Promise<CompositionWorkerResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${COMPOSITION_WORKER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Composition worker ${endpoint} → ${res.status}: ${detail}`);
    }
    return (await res.json()) as CompositionWorkerResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export function runComposition(params: {
  jobId: string;
  foregroundAlphaUrl: string;
  backgroundLoopUrl: string;
  backgroundMetadataUrl: string;
  compositionHelperUrl: string;
  footContactUrl: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  shadowStrength: number;
  shadowSoftness: number;
  lightMatchStrength: number;
  edgeBlendStrength: number;
  outputR2Key: string;
}): Promise<CompositionWorkerResponse> {
  return post("/compose", {
    input_url: params.foregroundAlphaUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {
      background_loop_url: params.backgroundLoopUrl,
      background_metadata_url: params.backgroundMetadataUrl,
      composition_helper_url: params.compositionHelperUrl,
      foot_contact_url: params.footContactUrl ?? null,
      width: params.width,
      height: params.height,
      fps: params.fps,
      duration_sec: params.durationSec,
      shadow_strength: params.shadowStrength,
      shadow_softness: params.shadowSoftness,
      light_match_strength: params.lightMatchStrength,
      edge_blend_strength: params.edgeBlendStrength,
    },
  });
}

export function validateCompositionWorker(params: {
  jobId: string;
  draftCompositeUrl: string;
  outputR2Key: string;
}): Promise<CompositionWorkerResponse> {
  return post("/validate", {
    input_url: params.draftCompositeUrl,
    job_id: params.jobId,
    output_r2_key: params.outputR2Key,
    options: {},
  });
}

export function retryComposition(params: {
  jobId: string;
  foregroundAlphaUrl: string;
  backgroundLoopUrl: string;
  backgroundMetadataUrl: string;
  compositionHelperUrl: string;
  footContactUrl: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  shadowStrength: number;
  shadowSoftness: number;
  lightMatchStrength: number;
  edgeBlendStrength: number;
  outputR2Key: string;
  retryReason: string;
}): Promise<CompositionWorkerResponse> {
  const { retryReason, ...rest } = params;
  return post("/retry", {
    input_url: rest.foregroundAlphaUrl,
    job_id: rest.jobId,
    output_r2_key: rest.outputR2Key,
    options: {
      background_loop_url: rest.backgroundLoopUrl,
      background_metadata_url: rest.backgroundMetadataUrl,
      composition_helper_url: rest.compositionHelperUrl,
      foot_contact_url: rest.footContactUrl ?? null,
      width: rest.width,
      height: rest.height,
      fps: rest.fps,
      duration_sec: rest.durationSec,
      shadow_strength: rest.shadowStrength,
      shadow_softness: rest.shadowSoftness,
      light_match_strength: rest.lightMatchStrength,
      edge_blend_strength: rest.edgeBlendStrength,
      retry_reason: retryReason,
    },
  });
}
