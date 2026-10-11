/**
 * polish.types.ts — Final Polish module shared types.
 */

export type PolishStrategy =
  | "postprocess"               // Strategy A: pure post-process (default)
  | "postprocess_plus_lip"      // Strategy B: A + mouth micro-correction
  | "postprocess_plus_generative"; // Strategy C: A + light generative harmonization

export interface PolishStyleOverrides {
  /** 0–1: edge/seam/halo artifact reduction (default 0.45) */
  artifactReductionStrength: number;
  /** 0–1: colour/light harmonization strength (default 0.25) */
  harmonizationStrength: number;
  /** 0–1: mouth region temporal correction (default 0.20) */
  lipCorrectionStrength: number;
  /** 0–1: skin/cloth texture naturalness restore (default 0.35) */
  textureNaturalnessStrength: number;
  /** 0–1: anti-plastic skin grain blend (default 0.40) */
  antiPlasticSkinStrength: number;
}

export const DEFAULT_POLISH_CONTROLS: PolishStyleOverrides = {
  artifactReductionStrength: 0.45,
  harmonizationStrength: 0.25,
  lipCorrectionStrength: 0.20,
  textureNaturalnessStrength: 0.35,
  antiPlasticSkinStrength: 0.40,
};

// ─── Input ───────────────────────────────────────────────────────────────────

export interface PolishInput {
  renderJobId: string;
  draftCompositeUrl: string;
  templateSnapshot: {
    audioUrl: string | null;
    durationSec: number;
    fps: number;
  };
  styleOverrides: PolishStyleOverrides;
  outputOptions: {
    resolution: { width: number; height: number };
    fps: number;
    enableAudioAwareLipCorrection: boolean;
    useGenerativePolish: boolean;
  };
}

// ─── Quality ─────────────────────────────────────────────────────────────────

export interface PolishQualityScores {
  artifactReductionScore: number;
  lipNaturalnessScore: number;
  textureNaturalnessScore: number;
  temporalPolishStabilityScore: number;
  overallNaturalnessScore: number;
  /** Lower = better (content drift from original) */
  contentDriftScore: number;
  passed: boolean;
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface PolishReport {
  renderJobId: string;
  strategy: PolishStrategy;
  effectiveControls: PolishStyleOverrides;
  quality: PolishQualityScores;
  retryCount: number;
  durationMs: number;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface PolishOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    polishedMasterUrl: string;
    polishReportUrl: string;
  };
  quality?: PolishQualityScores;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Worker protocol ─────────────────────────────────────────────────────────

export interface PolishWorkerRequest {
  input_url: string;
  job_id: string;
  output_r2_key: string;
  options: Record<string, unknown>;
}

export interface PolishWorkerResponse {
  output_url: string;
  meta: Record<string, unknown>;
}
