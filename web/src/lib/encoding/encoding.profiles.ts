/**
 * encoding.profiles.ts — FFmpeg encoding profile registry.
 *
 * Each profile maps to concrete FFmpeg parameters.
 * social_shortform_default: upload-compatible H.264/AAC for TikTok / Reels / Shorts.
 */

import type { EncodingProfile, TargetProfile } from "@/lib/encoding/encoding.types";

const PROFILES: Record<TargetProfile, EncodingProfile> = {
  social_shortform_default: {
    container: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    crf: 18,
    preset: "medium",
    movflags: "+faststart",
    audioSampleRate: 48000,
    audioBitrate: "192k",
  },
};

const SUPPORTED_PROFILES = new Set<string>(Object.keys(PROFILES));

export function resolveEncodingProfile(targetProfile: TargetProfile): EncodingProfile {
  return PROFILES[targetProfile];
}

export function isSupportedProfile(profile: string): profile is TargetProfile {
  return SUPPORTED_PROFILES.has(profile);
}
