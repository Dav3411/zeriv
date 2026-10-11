/**
 * face.types.ts — Face Pass 파이프라인 타입 정의 (7.6)
 */

// ─── Model ────────────────────────────────────────────────────────────────────

export type FaceGenerationModel = "liveportrait" | "stub";

export const SUPPORTED_FACE_MODELS: Set<FaceGenerationModel> = new Set([
  "liveportrait",
  "stub",
]);

// ─── Input ────────────────────────────────────────────────────────────────────

export interface FaceAssets {
  faceMasterUrl: string;
}

export interface FaceStyleOverrides {
  /** 0–1, default 0.9 */
  identityPreserveStrength?: number;
  /** 0–1, default 0.8 */
  expressionStrength?: number;
  /** 0–1, default 0.75 */
  mouthStrength?: number;
  /** 0–1, default 0.7 */
  eyeRetargetStrength?: number;
  /** 0–1, signal smoothing intensity. Higher = smoother/less jitter. default 0.5 */
  signalSmoothingStrength?: number;
}

export interface FacePassInput {
  renderJobId: string;
  characterId: string;
  modeType: "realistic" | "25d";
  faceGenerationModel: FaceGenerationModel;
  faceAssets: FaceAssets;
  templateSnapshot: {
    faceSignalUrl: string;
    faceBboxTimelineUrl?: string | null;
    durationSec: number;
    fps: number;
  };
  outputOptions: {
    resolution: { width: number; height: number };
    fps: number;
  };
  styleOverrides?: FaceStyleOverrides;
}

// ─── Face signal metadata (extracted from face_signal.json) ───────────────────

export interface FaceSignalMeta {
  frameCount: number;
  fps: number;
  hasHeadPose: boolean;
  hasExpression: boolean;
  hasMouth: boolean;
  hasEyes: boolean;
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export interface FaceQualityScores {
  identityConsistencyScore: number;
  headPoseMatchScore: number;
  expressionMatchScore: number;
  mouthStabilityScore: number;
  eyeStabilityScore: number;
  temporalFaceSmoothnessScore: number;
  passed: boolean;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface FacePassReport {
  renderJobId: string;
  faceGenerationModel: FaceGenerationModel;
  effectiveControls: Required<FaceStyleOverrides>;
  quality: FaceQualityScores;
  retryCount: number;
  durationMs: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface FacePassOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    facePassUrl: string;
    faceReportUrl: string;
  };
  quality?: FaceQualityScores;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Worker types ─────────────────────────────────────────────────────────────

export interface FaceWorkerRequest {
  input_url: string;
  job_id: string;
  output_r2_key?: string;
  options: Record<string, unknown>;
}

export interface FaceWorkerResponse {
  output_url: string;
  meta?: Record<string, unknown>;
}
