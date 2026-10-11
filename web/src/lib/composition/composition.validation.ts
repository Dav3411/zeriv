/**
 * composition.validation.ts — Input validation for the Scene Composition pipeline.
 */

import type { CompositionInput } from "@/lib/composition/composition.types";

interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
}

export function validateCompositionInput(input: CompositionInput): ValidationResult {
  const errors: Record<string, string[]> = {};

  if (!input.foreground?.alphaVideoUrl) {
    errors["foreground.alphaVideoUrl"] = ["foreground alphaVideoUrl is required"];
  }
  if (!input.background?.loopUrl) {
    errors["background.loopUrl"] = ["background loopUrl is required"];
  }
  if (!input.background?.metadataUrl) {
    errors["background.metadataUrl"] = ["background metadataUrl is required"];
  }
  if (!input.background?.compositionHelperUrl) {
    errors["background.compositionHelperUrl"] = ["background compositionHelperUrl is required"];
  }

  const { durationSec, fps } = input.templateSnapshot;
  if (typeof durationSec !== "number" || durationSec <= 0) {
    errors["templateSnapshot.durationSec"] = ["durationSec must be a positive number"];
  }
  if (typeof fps !== "number" || fps < 1 || fps > 120) {
    errors["templateSnapshot.fps"] = ["fps must be between 1 and 120"];
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
  rangeCheck("shadowStrength", "shadowStrength");
  rangeCheck("shadowSoftness", "shadowSoftness");
  rangeCheck("lightMatchStrength", "lightMatchStrength");
  rangeCheck("edgeBlendStrength", "edgeBlendStrength");

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
