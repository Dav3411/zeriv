/**
 * fusion.types.ts — Face-Body Fusion 파이프라인 타입 정의 (7.7)
 */

// ─── Input ────────────────────────────────────────────────────────────────────

export interface FusionStyleOverrides {
  /** 0–1. Face alpha blend strength over body. default 0.85 */
  faceBlendStrength?: number;
  /** 0–1. How aggressively to shift face skin tone toward body. default 0.7 */
  skinToneMatchStrength?: number;
  /** 0–1. Feather softness at hairline. default 0.65 */
  hairlineSoftness?: number;
  /** 0–1. Feather softness at jaw/neck seam. default 0.75 */
  neckBlendStrength?: number;
  /** 0–1. Temporal smoothing for placement jitter. default 0.5 */
  placementSmoothingStrength?: number;
}

export interface FusionInput {
  renderJobId: string;
  bodyPassUrl: string;
  facePassUrl: string;
  templateSnapshot: {
    faceBboxTimelineUrl?: string | null;
    durationSec: number;
    fps: number;
  };
  /** Optional: face master info JSON URL (has faceCropBox for face extraction) */
  faceMasterInfoUrl?: string | null;
  outputOptions: {
    resolution: { width: number; height: number };
    fps: number;
  };
  styleOverrides?: FusionStyleOverrides;
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export interface FusionQualityScores {
  placementStabilityScore: number;
  /** Lower is better: 0 = no seam visible, 1 = obvious seam */
  seamVisibilityScore: number;
  skinToneMatchScore: number;
  temporalFusionSmoothnessScore: number;
  identityRetentionScore: number;
  passed: boolean;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface FusionReport {
  renderJobId: string;
  effectiveControls: Required<FusionStyleOverrides>;
  quality: FusionQualityScores;
  retryCount: number;
  durationMs: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface FusionOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    fusedCharacterUrl: string;
    fusionReportUrl: string;
  };
  quality?: FusionQualityScores;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Worker types ─────────────────────────────────────────────────────────────

export interface FusionWorkerRequest {
  input_url: string;
  job_id: string;
  output_r2_key?: string;
  options: Record<string, unknown>;
}

export interface FusionWorkerResponse {
  output_url: string;
  meta?: Record<string, unknown>;
}
