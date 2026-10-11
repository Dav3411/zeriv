/**
 * composition.types.ts — Scene Composition module shared types.
 */

// ─── Style overrides ─────────────────────────────────────────────────────────

export interface CompositionStyleOverrides {
  /** 0–1: shadow density — default 0.70 */
  shadowStrength: number;
  /** 0–1: shadow blur/softness — default 0.65 */
  shadowSoftness: number;
  /** 0–1: colour/light harmonization intensity — default 0.60 */
  lightMatchStrength: number;
  /** 0–1: foreground edge feathering — default 0.55 */
  edgeBlendStrength: number;
}

export const DEFAULT_COMPOSITION_CONTROLS: CompositionStyleOverrides = {
  shadowStrength: 0.70,
  shadowSoftness: 0.65,
  lightMatchStrength: 0.60,
  edgeBlendStrength: 0.55,
};

// ─── Input ───────────────────────────────────────────────────────────────────

export interface CompositionInput {
  renderJobId: string;
  foreground: {
    alphaVideoUrl: string;
  };
  background: {
    loopUrl: string;
    metadataUrl: string;
    compositionHelperUrl: string;
  };
  templateSnapshot: {
    footContactJsonUrl: string | null;
    durationSec: number;
    fps: number;
  };
  styleOverrides: CompositionStyleOverrides;
  outputOptions: {
    resolution: { width: number; height: number };
    fps: number;
  };
}

// ─── Quality ─────────────────────────────────────────────────────────────────

export interface CompositionQualityScores {
  /** Character-to-ground contact naturalness */
  groundingScore: number;
  /** Shadow looks natural (not over/under-shadowed) */
  shadowNaturalnessScore: number;
  /** FG/BG colour and light harmony */
  lightMatchScore: number;
  /** Edge blending quality (no hard cutout) */
  edgeBlendScore: number;
  /** Frame-to-frame composition stability */
  temporalCompositionStabilityScore: number;
  /** Character placement fits the scene */
  spatialFitScore: number;
  passed: boolean;
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface CompositionReport {
  renderJobId: string;
  effectiveControls: CompositionStyleOverrides;
  sceneGeometry: {
    groundPlaneY: number;
    characterScale: number;
  };
  quality: CompositionQualityScores;
  retryCount: number;
  durationMs: number;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface CompositionOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    draftCompositeUrl: string;
    compositionReportUrl: string;
  };
  quality?: CompositionQualityScores;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Worker protocol ─────────────────────────────────────────────────────────

export interface CompositionWorkerRequest {
  input_url: string;
  job_id: string;
  output_r2_key: string;
  options: Record<string, unknown>;
}

export interface CompositionWorkerResponse {
  output_url: string;
  meta: Record<string, unknown>;
}
