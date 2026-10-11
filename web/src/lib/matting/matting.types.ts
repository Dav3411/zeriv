/**
 * matting.types.ts — Matting module shared types.
 */

export type AlphaFormat = "mov_prores_4444" | "webm_alpha" | "png_sequence";

export const SUPPORTED_ALPHA_FORMATS = new Set<AlphaFormat>([
  "mov_prores_4444",
  "webm_alpha",
  "png_sequence",
]);

// ─── Style overrides ─────────────────────────────────────────────────────────

export interface MattingStyleOverrides {
  /** 0–1: softness of the extracted edge (default 0.6) */
  edgeSoftness: number;
  /** 0–1: how aggressively hair detail is retained (default 0.75) */
  hairDetailStrength: number;
  /** 0–1: background colour spill suppression intensity (default 0.65) */
  spillSuppressionStrength: number;
  /** 0–1: temporal alpha smoothing intensity (default 0.55) */
  temporalSmoothingStrength: number;
}

export const DEFAULT_MATTING_CONTROLS: MattingStyleOverrides = {
  edgeSoftness: 0.6,
  hairDetailStrength: 0.75,
  spillSuppressionStrength: 0.65,
  temporalSmoothingStrength: 0.55,
};

// ─── Input ───────────────────────────────────────────────────────────────────

export interface MattingInput {
  renderJobId: string;
  fusedCharacterUrl: string;
  templateSnapshot: {
    footContactJsonUrl: string | null;
    durationSec: number;
    fps: number;
  };
  styleOverrides: MattingStyleOverrides;
  outputOptions: {
    resolution: { width: number; height: number };
    fps: number;
    alphaFormat: AlphaFormat;
  };
}

// ─── Quality ─────────────────────────────────────────────────────────────────

export interface MattingQualityScores {
  /** Edge gradient quality — higher = cleaner boundary */
  edgeQualityScore: number;
  /** Frame-to-frame alpha stability — higher = less shimmer */
  temporalAlphaStabilityScore: number;
  /** Hair edge detail retention */
  hairRetentionScore: number;
  /** Background spill removal — higher = less spill */
  spillSuppressionScore: number;
  /** Foreground interior holes / cutoff — higher = more complete foreground */
  foregroundIntegrityScore: number;
  /** Foot/shoe boundary clarity */
  footEdgeClarityScore: number;
  passed: boolean;
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface MattingReport {
  renderJobId: string;
  alphaFormat: AlphaFormat;
  effectiveControls: MattingStyleOverrides;
  quality: MattingQualityScores;
  retryCount: number;
  durationMs: number;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface MattingOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    foregroundAlphaUrl: string;
    foregroundPreviewUrl: string;
    mattingReportUrl: string;
  };
  quality?: MattingQualityScores;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Worker protocol ─────────────────────────────────────────────────────────

export interface MattingWorkerRequest {
  input_url: string;
  job_id: string;
  output_r2_key: string;
  options: Record<string, unknown>;
}

export interface MattingWorkerResponse {
  output_url: string;
  meta: Record<string, unknown>;
}
