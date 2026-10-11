/**
 * backgroundVideo.types.ts — 배경 영상 파이프라인 타입 정의 (7.4)
 */

export type MotionPreset =
  | "slow_pan_left"
  | "slow_pan_right"
  | "subtle_push_in"
  | "subtle_pull_out"
  | "micro_parallax_drift";

export interface BackgroundVideoInput {
  renderJobId: string;
  /** background_master.png URL (7.3 산출물) */
  backgroundMasterUrl: string;
  motionPreset: MotionPreset;
  targetDurationSec: number;
  fps: number;
  resolution: { width: number; height: number };
  /** foot contact JSON URL (template 산출물, optional) */
  footContactJsonUrl?: string | null;
  usePremiumVideoGeneration?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker request / response
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerRequest {
  input_url: string;
  job_id: string;
  options: Record<string, unknown>;
}

export interface WorkerResponse {
  output_url: string;
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Background metadata
// ─────────────────────────────────────────────────────────────────────────────

export interface BackgroundMetadata {
  groundPlaneY: number;
  horizonLineY: number;
  vanishingPoint: [number, number];
  lightDirection: "left" | "right" | "front_soft" | "back_rim" | "top_soft";
  safeSubjectZone: { x: number; y: number; w: number; h: number };
  sceneComplexityScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition helper
// ─────────────────────────────────────────────────────────────────────────────

export interface CompositionHelper {
  characterScale: number;
  characterYOffset: number;
  shadowDirection: "left" | "right" | "front_soft" | "back_rim" | "top_soft";
  shadowStrength: number;
  shadowBlur: number;
  safeSubjectZone: { x: number; y: number; w: number; h: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service output
// ─────────────────────────────────────────────────────────────────────────────

export interface BackgroundVideoOutput {
  renderJobId: string;
  status: "completed" | "failed";
  assets?: {
    backgroundMetadataUrl: string;
    depthMapUrl: string;
    motionPlateUrl: string;
    backgroundLoopUrl: string;
    compositionHelperUrl: string;
  };
  errorCode?: string;
  errorMessage?: string;
}
