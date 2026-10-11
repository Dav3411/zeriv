/**
 * encoding.validation.ts — Input validation for the Final Encoding module.
 */

import { isSupportedProfile } from "@/lib/encoding/encoding.profiles";
import type { EncodingInput } from "@/lib/encoding/encoding.types";

const SUPPORTED_FORMATS = new Set(["mp4_h264_aac"]);
const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 300;

export type EncodingValidationResult =
  | { ok: true }
  | { ok: false; errorCode: string; errorMessage: string };

export function validateEncodingInput(input: EncodingInput): EncodingValidationResult {
  if (!input.polishedMasterUrl) {
    return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: "polishedMasterUrl is required" };
  }

  const { durationSec, fps } = input.templateSnapshot;
  if (!durationSec || durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
    return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: `durationSec must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC}` };
  }
  if (!fps || fps <= 0 || fps > 120) {
    return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: "fps must be between 1 and 120" };
  }

  const { resolution, format, targetProfile } = input.outputOptions;
  if (!resolution?.width || !resolution?.height || resolution.width <= 0 || resolution.height <= 0) {
    return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: "resolution.width and resolution.height must be positive" };
  }
  if (resolution.width > resolution.height === false) {
    // portrait check: height should be > width for 9:16
    if (resolution.width > resolution.height) {
      return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: "Resolution must be portrait (height > width) for social shortform" };
    }
  }

  if (!SUPPORTED_FORMATS.has(format)) {
    return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: `Unsupported format: ${format}` };
  }
  if (!isSupportedProfile(targetProfile)) {
    return { ok: false, errorCode: "FINAL_ENCODING_INPUT_INVALID", errorMessage: `Unsupported targetProfile: ${targetProfile}` };
  }

  return { ok: true };
}
