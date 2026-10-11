/**
 * backgroundWorkerClient.ts — Python 배경 처리 워커 HTTP 클라이언트
 *
 * 모든 통신은 BACKGROUND_WORKER_URL 환경변수 기반.
 * 각 엔드포인트는 동일한 request/response 인터페이스를 따른다.
 *
 * 환경 변수:
 *   BACKGROUND_WORKER_URL — Python FastAPI 워커 base URL
 *                           예: http://localhost:8100
 *                               https://my-worker.modal.run
 */

import type { WorkerRequest, WorkerResponse } from "@/lib/background/backgroundVideo.types";

const MAX_RETRIES = 2;
const TIMEOUT_MS = 120_000; // 2분

function getWorkerUrl(): string {
  const url = process.env.BACKGROUND_WORKER_URL?.trim();
  if (!url) throw new Error("BACKGROUND_WORKER_URL is not configured");
  return url.replace(/\/$/, ""); // trailing slash 제거
}

async function callWorkerEndpoint(
  endpoint: string,
  payload: WorkerRequest
): Promise<WorkerResponse> {
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
        throw new Error(`Worker /${endpoint} responded ${res.status}: ${text}`);
      }

      return (await res.json()) as WorkerResponse;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[bg-worker] /${endpoint} attempt ${attempt + 1} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Worker /${endpoint} failed after ${MAX_RETRIES + 1} attempts: ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers — each function maps to one Python worker endpoint
// ─────────────────────────────────────────────────────────────────────────────

export async function extractBackgroundMetadata(opts: {
  jobId: string;
  inputUrl: string;
  width: number;
  height: number;
}): Promise<WorkerResponse> {
  return callWorkerEndpoint("metadata", {
    input_url: opts.inputUrl,
    job_id: opts.jobId,
    options: { width: opts.width, height: opts.height },
  });
}

export async function generateDepthMap(opts: {
  jobId: string;
  inputUrl: string;
  width: number;
  height: number;
}): Promise<WorkerResponse> {
  return callWorkerEndpoint("depth", {
    input_url: opts.inputUrl,
    job_id: opts.jobId,
    options: { width: opts.width, height: opts.height },
  });
}

export async function generateMotionPlate(opts: {
  jobId: string;
  inputUrl: string;
  depthMapUrl: string;
  motionPreset: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}): Promise<WorkerResponse> {
  return callWorkerEndpoint("motion-plate", {
    input_url: opts.inputUrl,
    job_id: opts.jobId,
    options: {
      depth_map_url: opts.depthMapUrl,
      motion_preset: opts.motionPreset,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      duration_sec: opts.durationSec,
    },
  });
}

export async function composeBackgroundLoop(opts: {
  jobId: string;
  inputUrl: string;
  targetDurationSec: number;
  fps: number;
}): Promise<WorkerResponse> {
  return callWorkerEndpoint("loop", {
    input_url: opts.inputUrl,
    job_id: opts.jobId,
    options: {
      target_duration_sec: opts.targetDurationSec,
      fps: opts.fps,
    },
  });
}

export async function stabilizeBackground(opts: {
  jobId: string;
  inputUrl: string;
}): Promise<WorkerResponse> {
  return callWorkerEndpoint("stabilize", {
    input_url: opts.inputUrl,
    job_id: opts.jobId,
    options: {},
  });
}

export async function computeCompositionHelper(opts: {
  jobId: string;
  metadataUrl: string;
  footContactJsonUrl?: string | null;
  width: number;
  height: number;
}): Promise<WorkerResponse> {
  return callWorkerEndpoint("composition-helper", {
    input_url: opts.metadataUrl,
    job_id: opts.jobId,
    options: {
      foot_contact_url: opts.footContactJsonUrl ?? null,
      width: opts.width,
      height: opts.height,
    },
  });
}
