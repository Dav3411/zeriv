/**
 * body.workerClientV1.ts — Body Worker HTTP 클라이언트 (v1 minimal)
 *
 * v1은 단일 POST /render 엔드포인트를 사용한다.
 * prepare/generate/validate 멀티스텝은 v2에서 지원 예정.
 *
 * 환경 변수:
 *   BODY_WORKER_URL            — FastAPI/Python 워커 base URL (필수)
 *                                예: http://localhost:8200
 *                                    https://my-body-worker.modal.run
 *   BODY_WORKER_MOCK_FALLBACK  — "true" 이면 worker 미설정/실패 시 mock 결과 반환
 *   BODY_WORKER_MOCK_VIDEO_URL — mock fallback에서 반환할 영상 URL (선택)
 *                                기본값: R2_PUBLIC_URL/test/sample.mp4
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BodyWorkerV1Request {
  job_id: string;
  canonical_c1_url: string;
  canonical_c2_url: string | null;
  canonical_c3_url: string | null;
  /**
   * MimicMotion driving video URL.
   * null이면 worker가 pose_data_url(JSON keypoints) 기반으로 동작.
   */
  motion_video_url: string | null;
  template_code: string;
  category: string;
  shot_type: string;
  width: number;
  height: number;
  fps: number;
  duration_sec: number;
  pose_data_url: string | null;
  bbox_timeline_url: string | null;
  foot_contact_url: string | null;
}

export interface BodyWorkerV1Response {
  output_url: string;
  quality_score?: number;
  passed?: boolean;
  warnings?: string[];
  render_duration_ms?: number;
}

export interface BodyPassV1Input {
  jobId: string;
  canonicalC1Url: string;
  canonicalC2Url?: string;
  canonicalC3Url?: string;
  /** MimicMotion driving video URL. null이면 poseDataUrl(JSON) 기반 동작. */
  motionVideoUrl?: string | null;
  templateCode: string;
  category: string;
  shotType: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  poseDataUrl?: string;
  bboxTimelineUrl?: string | null;
  footContactUrl?: string | null;
}

export interface BodyPassV1Result {
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
  return process.env.BODY_WORKER_URL?.trim() || null;
}

function isMockFallbackEnabled(): boolean {
  return process.env.BODY_WORKER_MOCK_FALLBACK === "true";
}

function getMockVideoUrl(): string {
  if (process.env.BODY_WORKER_MOCK_VIDEO_URL?.trim()) {
    return process.env.BODY_WORKER_MOCK_VIDEO_URL.trim();
  }
  const r2 = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  return r2 ? `${r2}/test/sample.mp4` : "";
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** MimicMotion은 1080p 5s 클립 기준 ~3분 소요. 5분으로 여유 확보. */
const TIMEOUT_MS = 300_000; // 5분
/** 5xx / 네트워크 오류 시 1회 재시도. 재시도 전 대기 시간 (ms). */
const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 1;

/**
 * body worker v1 /render 엔드포인트 호출.
 *
 * - 5xx / 네트워크 오류 → MAX_RETRIES(1)회 재시도 (5s 대기)
 * - 4xx → 즉시 실패 (재시도 없음 — 입력 오류)
 * - BODY_WORKER_URL 미설정 또는 모든 재시도 실패 시:
 *     BODY_WORKER_MOCK_FALLBACK=true  → mock result (fallbackUsed: true)
 *     BODY_WORKER_MOCK_FALLBACK 미설정 → Error throw
 */
export async function callBodyWorkerV1(
  input: BodyPassV1Input
): Promise<BodyPassV1Result> {
  const workerUrl = getWorkerUrl();
  const fallbackEnabled = isMockFallbackEnabled();
  const startMs = Date.now();

  // ── worker URL 미설정
  if (!workerUrl) {
    if (fallbackEnabled) {
      return buildMockResult(input, startMs, "BODY_WORKER_URL not configured");
    }
    throw new Error("BODY_WORKER_URL is not configured");
  }

  const endpoint = `${workerUrl}/render`;
  const payload: BodyWorkerV1Request = {
    job_id: input.jobId,
    canonical_c1_url: input.canonicalC1Url,
    canonical_c2_url: input.canonicalC2Url ?? null,
    canonical_c3_url: input.canonicalC3Url ?? null,
    motion_video_url: input.motionVideoUrl ?? null,
    template_code: input.templateCode,
    category: input.category,
    shot_type: input.shotType,
    width: input.width,
    height: input.height,
    fps: input.fps,
    duration_sec: input.durationSec,
    pose_data_url: input.poseDataUrl ?? null,
    bbox_timeline_url: input.bboxTimelineUrl ?? null,
    foot_contact_url: input.footContactUrl ?? null,
  };

  // ── real worker 호출 (with retry)
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      console.warn(
        JSON.stringify({
          action: "body_worker_retry",
          jobId: input.jobId,
          attempt,
          reason: lastError,
        })
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as BodyWorkerV1Response;
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
      lastError = `Body worker /render responded ${res.status}: ${text}`;

      // 4xx → 재시도 없음
      if (res.status >= 400 && res.status < 500) break;

    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // ── 모든 시도 실패
  if (fallbackEnabled) {
    return buildMockResult(input, startMs, lastError ?? "unknown error");
  }
  throw new Error(lastError ?? "Body worker /render failed");
}

// ─── Mock fallback builder ────────────────────────────────────────────────────

function buildMockResult(
  input: BodyPassV1Input,
  startMs: number,
  reason: string
): BodyPassV1Result {
  const mockUrl = getMockVideoUrl();

  console.warn(
    JSON.stringify({
      action: "body_pass_mock_fallback",
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
