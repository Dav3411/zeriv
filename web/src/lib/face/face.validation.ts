/**
 * face.validation.ts — Face Pass 입력 검증
 */

import { SUPPORTED_FACE_MODELS } from "@/lib/face/face.types";
import type { FacePassInput } from "@/lib/face/face.types";

const ALLOWED_FPS = new Set([24, 30, 60]);
const ALLOWED_RESOLUTIONS = new Set(["720x1280", "1080x1920", "540x960"]);

export interface FaceValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
}

export function validateFacePassInput(input: FacePassInput): FaceValidationResult {
  const errors: Record<string, string[]> = {};

  function addError(field: string, msg: string) {
    (errors[field] ??= []).push(msg);
  }

  if (!input.renderJobId) addError("renderJobId", "Required");
  if (!input.characterId) addError("characterId", "Required");

  if (!SUPPORTED_FACE_MODELS.has(input.faceGenerationModel)) {
    addError("faceGenerationModel", `Unsupported model: ${input.faceGenerationModel}`);
  }

  if (!input.faceAssets.faceMasterUrl) {
    addError("faceAssets.faceMasterUrl", "Required");
  }

  const tpl = input.templateSnapshot;
  if (!tpl.faceSignalUrl) addError("templateSnapshot.faceSignalUrl", "Required");
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
  const rangeFields: Array<[keyof typeof so, string]> = [
    ["identityPreserveStrength", "styleOverrides.identityPreserveStrength"],
    ["expressionStrength", "styleOverrides.expressionStrength"],
    ["mouthStrength", "styleOverrides.mouthStrength"],
    ["eyeRetargetStrength", "styleOverrides.eyeRetargetStrength"],
    ["signalSmoothingStrength", "styleOverrides.signalSmoothingStrength"],
  ];
  for (const [key, field] of rangeFields) {
    const v = so[key];
    if (v !== undefined && (v < 0 || v > 1)) {
      addError(field, "Must be 0–1");
    }
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
