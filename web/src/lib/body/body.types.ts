/**
 * body.types.ts — Body Pass 파이프라인 타입 정의 (7.5)
 */

// ─── Model ────────────────────────────────────────────────────────────────────

export type BodyGenerationModel = "mimicmotion" | "stub";

export const SUPPORTED_BODY_MODELS: Set<BodyGenerationModel> = new Set([
  "mimicmotion",
  "stub",
]);

// ─── Input ────────────────────────────────────────────────────────────────────

export interface CanonicalSetInput {
  c1Url: string;
  c2Url: string;
  c3Url: string;
}

export interface BodyStyleOverrides {
  /** 0–1. How strictly to follow template pose. default 0.8 */
  motionStrictness?: number;
  /** 0–1. Identity preservation strength. default 0.7 */
  identityPreserveStrength?: number;
  /** 0–1. Cloth detail preservation strength. default 0.5 */
  clothDetailStrength?: number;
}

export interface BodyPassInput {
  renderJobId: string;
  characterId: string;
  modeType: "realistic" | "25d";
  bodyGenerationModel: BodyGenerationModel;
  outfitCanonicalSet: CanonicalSetInput;
  templateSnapshot: {
    poseDataUrl: string;
    bboxTimelineUrl?: string | null;
    footContactJsonUrl?: string | null;
    durationSec: number;
    fps: number;
  };
  outputOptions: {
    resolution: { width: number; height: number };
    fps: number;
  };
  styleOverrides?: BodyStyleOverrides;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export type CanonicalRef = "c1" | "c2" | "c3";

export interface MotionSegment {
  startFrame: number;
  endFrame: number;
  primaryRef: CanonicalRef;
}

export interface RoutingPlan {
  segments: MotionSegment[];
  totalFrames: number;
}

// ─── Canonical asset analysis ─────────────────────────────────────────────────

export type CanonicalRole = "front_neutral" | "three_quarter" | "raised_arm";

export interface CanonicalInfo {
  url: string;
  role: CanonicalRole;
  /** [x1, y1, x2, y2] pixel bbox of body region */
  bodyBbox: [number, number, number, number];
}

export interface ResolvedCanonicalSet {
  c1: CanonicalInfo;
  c2: CanonicalInfo;
  c3: CanonicalInfo;
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export interface BodyQualityScores {
  poseAlignmentScore: number;
  temporalSmoothnessScore: number;
  bodyConsistencyScore: number;
  clothStabilityScore: number;
  footGroundingScore: number;
  passed: boolean;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface BodyPassReport {
  renderJobId: string;
  bodyGenerationModel: BodyGenerationModel;
  routing: RoutingPlan;
  quality: BodyQualityScores;
  retryCount: number;
  durationMs: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface BodyPassOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    bodyPassUrl: string;
    bodyReportUrl: string;
  };
  quality?: BodyQualityScores;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Worker request / response (mirrors backgroundVideo.types WorkerRequest) ──

export interface BodyWorkerRequest {
  input_url: string;
  job_id: string;
  options: Record<string, unknown>;
}

export interface BodyWorkerResponse {
  output_url: string;
  meta?: Record<string, unknown>;
}
