/**
 * fusion.validation.ts — Fusion 입력 검증
 */

import type { FusionInput } from "@/lib/fusion/fusion.types";

const ALLOWED_FPS = new Set([24, 30, 60]);
const ALLOWED_RESOLUTIONS = new Set(["720x1280", "1080x1920", "540x960"]);

export interface FusionValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
}

export function validateFusionInput(input: FusionInput): FusionValidationResult {
  const errors: Record<string, string[]> = {};

  function addError(field: string, msg: string) {
    (errors[field] ??= []).push(msg);
  }

  if (!input.renderJobId) addError("renderJobId", "Required");
  if (!input.bodyPassUrl) addError("bodyPassUrl", "Required — body_pass must be completed first");
  if (!input.facePassUrl) addError("facePassUrl", "Required — face_pass must be completed first");

  const tpl = input.templateSnapshot;
  if (tpl.durationSec <= 0) addError("templateSnapshot.durationSec", "Must be > 0");
  if (tpl.durationSec > 60) addError("templateSnapshot.durationSec", "Must be ≤ 60s");
  if (!ALLOWED_FPS.has(tpl.fps)) {
    addError("templateSnapshot.fps", `fps must be one of ${[...ALLOWED_FPS].join(", ")}`);
  }

  const { resolution, fps } = input.outputOptions;
  const resKey = `${resolution.width}x${resolution.height}`;
  if (!ALLOWED_RESOLUTIONS.has(resKey)) {
    addError("outputOptions.resolution", `Unsupported resolution ${resKey}`);
  }
  if (!ALLOWED_FPS.has(fps)) {
    addError("outputOptions.fps", `fps must be one of ${[...ALLOWED_FPS].join(", ")}`);
  }

  const so = input.styleOverrides ?? {};
  const rangeChecks: [number | undefined, string][] = [
    [so.faceBlendStrength, "styleOverrides.faceBlendStrength"],
    [so.skinToneMatchStrength, "styleOverrides.skinToneMatchStrength"],
    [so.hairlineSoftness, "styleOverrides.hairlineSoftness"],
    [so.neckBlendStrength, "styleOverrides.neckBlendStrength"],
    [so.placementSmoothingStrength, "styleOverrides.placementSmoothingStrength"],
  ];
  for (const [v, field] of rangeChecks) {
    if (v !== undefined && (v < 0 || v > 1)) addError(field, "Must be 0–1");
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
