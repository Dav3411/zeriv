/**
 * face.workerClientV1.ts — Face Worker HTTP 클라이언트 (v1 minimal)
 *
 * v1은 단일 POST /render 엔드포인트를 사용한다.
 * resolve/prepare-signal/generate/validate 멀티스텝은 v2에서 지원 예정.
 *
 * 환경 변수:
 *   FACE_WORKER_URL            — FastAPI/Python 워커 base URL
 *                                예: http://localhost:8300
 *                                    https://my-face-worker.modal.run
 *   FACE_WORKER_MOCK_FALLBACK  — "true" 이면 worker 미설정/실패 시 mock 결과 반환
 *   FACE_WORKER_MOCK_VIDEO_URL — mock fallback에서 반환할 영상 URL (선택)
 *                                기본값: R2_PUBLIC_URL/test/sample.mp4
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaceWorkerV1Request {
  job_id: string;
  face_master_url: string;
  body_pass_url: string;
  face_signal_url: string | null;
  template_code: string;
  category: string;
  shot_type: string;
  width: number;
  height: number;
  fps: number;
  duration_sec: number;
  identity_preserve_strength: number;
  expression_strength: number;
}

export interface FaceWorkerV1Response {
  output_url: string;
  quality_score?: number;
  passed?: boolean;
  warnings?: string[];
  render_duration_ms?: number;
}

export interface FacePassV1Input {
  jobId: string;
  faceMasterUrl: string;
  bodyPassUrl: string;
  faceSignalUrl?: string;
  templateCode: string;
  category: string;
  shotType: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  identityPreserveStrength: number;
  expressionStrength: number;
}

export interface FacePassV1Result {
  outputUrl: string;
  qualityScore: number;
  passed: boolean;
  warnings: string[];
  renderDurationMs: number;
  /** true이면 real worker 대신 mock fallback을 사용한 것 */
  fallbackUsed: boolean;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function getWorkerUrl(): string | null {
  return process.env.FACE_WORKER_URL?.trim() || null;
}

function isMockFallbackEnabled(): boolean {
  return process.env.FACE_WORKER_MOCK_FALLBACK === "true";
}

function getMockVideoUrl(): string {
  if (process.env.FACE_WORKER_MOCK_VIDEO_URL?.trim()) {
    return process.env.FACE_WORKER_MOCK_VIDEO_URL.trim();
  }
  const r2 = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  return r2 ? `${r2}/test/sample.mp4` : "";
}

// ─── Main export ──────────────────────────────────────────────────────────────

const TIMEOUT_MS = 120_000; // 2분

/**
 * face worker v1 /render 엔드포인트 호출.
 *
 * FACE_WORKER_URL 미설정 또는 호출 실패 시:
 *   - FACE_WORKER_MOCK_FALLBACK=true  → mock result 반환 (fallbackUsed: true)
 *   - FACE_WORKER_MOCK_FALLBACK 미설정 → Error throw
 */
export async function callFaceWorkerV1(
  input: FacePassV1Input
): Promise<FacePassV1Result> {
  const workerUrl = getWorkerUrl();
  const fallbackEnabled = isMockFallbackEnabled();
  const startMs = Date.now();

  if (!workerUrl) {
    if (fallbackEnabled) {
      return buildMockResult(input, startMs, "FACE_WORKER_URL not configured");
    }
    throw new Error("FACE_WORKER_URL is not configured");
  }

  const endpoint = `${workerUrl}/render`;
  const payload: FaceWorkerV1Request = {
    job_id: input.jobId,
    face_master_url: input.faceMasterUrl,
    body_pass_url: input.bodyPassUrl,
    face_signal_url: input.faceSignalUrl ?? null,
    template_code: input.templateCode,
    category: input.category,
    shot_type: input.shotType,
    width: input.width,
    height: input.height,
    fps: input.fps,
    duration_sec: input.durationSec,
    identity_preserve_strength: input.identityPreserveStrength,
    expression_strength: input.expressionStrength,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let workerError: string | null = null;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = (await res.json()) as FaceWorkerV1Response;
      return {
        outputUrl: data.output_url,
        qualityScore: data.quality_score ?? 1.0,
        passed: data.passed ?? true,
        warnings: data.warnings ?? [],
        renderDurationMs: Date.now() - startMs,
        fallbackUsed: false,
      };
    }

    const text = await res.text().catch(() => "");
    workerError = `Face worker /render responded ${res.status}: ${text}`;
  } catch (err) {
    workerError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  if (fallbackEnabled) {
    return buildMockResult(input, startMs, workerError ?? "unknown error");
  }
  throw new Error(workerError ?? "Face worker /render failed");
}

// ─── Mock fallback builder ────────────────────────────────────────────────────

function buildMockResult(
  input: FacePassV1Input,
  startMs: number,
  reason: string
): FacePassV1Result {
  const mockUrl = getMockVideoUrl();

  console.warn(
    JSON.stringify({
      action: "face_pass_mock_fallback",
      jobId: input.jobId,
      reason,
      mockUrl: mockUrl || "(empty)",
    })
  );

  return {
    outputUrl: mockUrl,
    qualityScore: 0.75,
    passed: true,
    warnings: [`mock_fallback: ${reason}`],
    renderDurationMs: Date.now() - startMs,
    fallbackUsed: true,
  };
}
