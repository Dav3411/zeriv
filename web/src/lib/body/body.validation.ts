/**
 * body.validation.ts — Body Pass 입력 검증
 */

import { SUPPORTED_BODY_MODELS } from "@/lib/body/body.types";
import type { BodyPassInput } from "@/lib/body/body.types";

const ALLOWED_FPS = new Set([24, 30, 60]);
const ALLOWED_RESOLUTIONS = new Set(["720x1280", "1080x1920", "540x960"]);

export interface BodyValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
}

export function validateBodyPassInput(input: BodyPassInput): BodyValidationResult {
  const errors: Record<string, string[]> = {};

  function addError(field: string, msg: string) {
    (errors[field] ??= []).push(msg);
  }

  // Identity
  if (!input.renderJobId) addError("renderJobId", "Required");
  if (!input.characterId) addError("characterId", "Required");

  // Model
  if (!SUPPORTED_BODY_MODELS.has(input.bodyGenerationModel)) {
    addError("bodyGenerationModel", `Unsupported model: ${input.bodyGenerationModel}`);
  }

  // Canonical set
  const { c1Url, c2Url, c3Url } = input.outfitCanonicalSet;
  if (!c1Url) addError("outfitCanonicalSet.c1Url", "Required");
  if (!c2Url) addError("outfitCanonicalSet.c2Url", "Required");
  if (!c3Url) addError("outfitCanonicalSet.c3Url", "Required");

  // Template snapshot
  const tpl = input.templateSnapshot;
  if (!tpl.poseDataUrl) addError("templateSnapshot.poseDataUrl", "Required");

  if (tpl.durationSec <= 0) {
    addError("templateSnapshot.durationSec", "Must be > 0");
  }
  if (tpl.durationSec > 60) {
    addError("templateSnapshot.durationSec", "Must be ≤ 60s");
  }
  if (!ALLOWED_FPS.has(tpl.fps)) {
    addError("templateSnapshot.fps", `fps must be one of ${[...ALLOWED_FPS].join(", ")}`);
  }

  // Output options
  const { resolution, fps } = input.outputOptions;
  const resKey = `${resolution.width}x${resolution.height}`;
  if (!ALLOWED_RESOLUTIONS.has(resKey)) {
    addError("outputOptions.resolution", `Unsupported resolution ${resKey}. Allowed: ${[...ALLOWED_RESOLUTIONS].join(", ")}`);
  }
  if (!ALLOWED_FPS.has(fps)) {
    addError("outputOptions.fps", `fps must be one of ${[...ALLOWED_FPS].join(", ")}`);
  }

  // Style overrides (optional, range check only)
  const so = input.styleOverrides ?? {};
  if (so.motionStrictness !== undefined && (so.motionStrictness < 0 || so.motionStrictness > 1)) {
    addError("styleOverrides.motionStrictness", "Must be 0–1");
  }
  if (so.identityPreserveStrength !== undefined && (so.identityPreserveStrength < 0 || so.identityPreserveStrength > 1)) {
    addError("styleOverrides.identityPreserveStrength", "Must be 0–1");
  }
  if (so.clothDetailStrength !== undefined && (so.clothDetailStrength < 0 || so.clothDetailStrength > 1)) {
    addError("styleOverrides.clothDetailStrength", "Must be 0–1");
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
