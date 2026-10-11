/**
 * polish.validation.ts — Input validation for the Final Polish pipeline.
 */

import type { PolishInput } from "@/lib/polish/polish.types";

interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
}

export function validatePolishInput(input: PolishInput): ValidationResult {
  const errors: Record<string, string[]> = {};

  if (!input.draftCompositeUrl) {
    errors.draftCompositeUrl = ["draftCompositeUrl is required"];
  }

  const { durationSec, fps } = input.templateSnapshot;
  if (typeof durationSec !== "number" || durationSec <= 0) {
    errors["templateSnapshot.durationSec"] = ["durationSec must be a positive number"];
  }
  if (typeof fps !== "number" || fps < 1 || fps > 120) {
    errors["templateSnapshot.fps"] = ["fps must be between 1 and 120"];
  }

  if (input.outputOptions.enableAudioAwareLipCorrection && !input.templateSnapshot.audioUrl) {
    // Non-fatal: downgrade to postprocess strategy rather than fail
    // Caller should handle this by disabling lip correction
  }

  const { resolution, fps: outFps } = input.outputOptions;
  if (!resolution || typeof resolution.width !== "number" || typeof resolution.height !== "number") {
    errors["outputOptions.resolution"] = ["resolution must have numeric width and height"];
  }
  if (typeof outFps !== "number" || outFps < 1 || outFps > 120) {
    errors["outputOptions.fps"] = ["fps must be between 1 and 120"];
  }

  const so = input.styleOverrides;
  const rangeCheck = (key: keyof typeof so, label: string) => {
    const v = so[key];
    if (typeof v !== "number" || v < 0 || v > 1) {
      errors[`styleOverrides.${key}`] = [`${label} must be 0–1`];
    }
  };
  rangeCheck("artifactReductionStrength", "artifactReductionStrength");
  rangeCheck("harmonizationStrength", "harmonizationStrength");
  rangeCheck("lipCorrectionStrength", "lipCorrectionStrength");
  rangeCheck("textureNaturalnessStrength", "textureNaturalnessStrength");
  rangeCheck("antiPlasticSkinStrength", "antiPlasticSkinStrength");

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
