/**
 * matting.validation.ts — Input validation for the matting pipeline.
 */

import type { MattingInput, AlphaFormat } from "@/lib/matting/matting.types";
import { SUPPORTED_ALPHA_FORMATS } from "@/lib/matting/matting.types";

interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
}

export function validateMattingInput(input: MattingInput): ValidationResult {
  const errors: Record<string, string[]> = {};

  // fusedCharacterUrl
  if (!input.fusedCharacterUrl || typeof input.fusedCharacterUrl !== "string") {
    errors.fusedCharacterUrl = ["fusedCharacterUrl is required"];
  }

  // templateSnapshot
  const { durationSec, fps } = input.templateSnapshot;
  if (typeof durationSec !== "number" || durationSec <= 0) {
    errors["templateSnapshot.durationSec"] = ["durationSec must be a positive number"];
  }
  if (typeof fps !== "number" || fps < 1 || fps > 120) {
    errors["templateSnapshot.fps"] = ["fps must be between 1 and 120"];
  }

  // outputOptions
  const { resolution, fps: outFps, alphaFormat } = input.outputOptions;
  if (!resolution || typeof resolution.width !== "number" || typeof resolution.height !== "number") {
    errors["outputOptions.resolution"] = ["resolution must have numeric width and height"];
  } else {
    if (resolution.width < 64 || resolution.width > 3840) {
      errors["outputOptions.resolution.width"] = ["width must be 64–3840"];
    }
    if (resolution.height < 64 || resolution.height > 3840) {
      errors["outputOptions.resolution.height"] = ["height must be 64–3840"];
    }
  }
  if (typeof outFps !== "number" || outFps < 1 || outFps > 120) {
    errors["outputOptions.fps"] = ["fps must be between 1 and 120"];
  }
  if (!SUPPORTED_ALPHA_FORMATS.has(alphaFormat as AlphaFormat)) {
    errors["outputOptions.alphaFormat"] = [
      `alphaFormat must be one of: ${[...SUPPORTED_ALPHA_FORMATS].join(", ")}`,
    ];
  }

  // styleOverrides
  const so = input.styleOverrides;
  const rangeCheck = (key: keyof typeof so, label: string) => {
    const v = so[key];
    if (typeof v !== "number" || v < 0 || v > 1) {
      errors[`styleOverrides.${key}`] = [`${label} must be a number between 0 and 1`];
    }
  };
  rangeCheck("edgeSoftness", "edgeSoftness");
  rangeCheck("hairDetailStrength", "hairDetailStrength");
  rangeCheck("spillSuppressionStrength", "spillSuppressionStrength");
  rangeCheck("temporalSmoothingStrength", "temporalSmoothingStrength");

  return {
    valid: Object.keys(errors).length === 0,
    fieldErrors: errors,
  };
}
