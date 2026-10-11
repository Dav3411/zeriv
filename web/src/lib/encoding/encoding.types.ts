/**
 * encoding.types.ts — Final Encoding module types.
 */

// ─── Encoding profiles ────────────────────────────────────────────────────────

export type TargetProfile = "social_shortform_default";

export type OutputFormat = "mp4_h264_aac";

export interface EncodingProfile {
  container: "mp4";
  videoCodec: "libx264";
  audioCodec: "aac";
  pixelFormat: "yuv420p";
  crf: number;
  preset: "veryfast" | "fast" | "medium" | "slow";
  movflags: string;
  audioSampleRate: number;
  audioBitrate: string;
}

// ─── Input / output ───────────────────────────────────────────────────────────

export interface EncodingOutputOptions {
  resolution: { width: number; height: number };
  fps: number;
  format: OutputFormat;
  targetProfile: TargetProfile;
  generateThumbnail: boolean;
  generatePreviewClip: boolean;
}

export interface EncodingInput {
  renderJobId: string;
  polishedMasterUrl: string;
  templateSnapshot: {
    durationSec: number;
    fps: number;
  };
  outputOptions: EncodingOutputOptions;
}

// ─── Quality / validation ─────────────────────────────────────────────────────

export interface EncodingOutputMeta {
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  container: string;
  playable: boolean;
}

export interface EncodingOutputMetadata {
  renderJobId: string;
  targetProfile: TargetProfile;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  container: string;
  thumbnailGenerated: boolean;
  previewGenerated: boolean;
}

// ─── Worker request / response ────────────────────────────────────────────────

export interface EncodingWorkerRequest {
  input_url: string;
  job_id: string;
  output_r2_key: string;
  options: {
    width: number;
    height: number;
    fps: number;
    crf: number;
    preset: string;
    audio_sample_rate: number;
    audio_bitrate: string;
    generate_thumbnail: boolean;
    generate_preview_clip: boolean;
    thumbnail_r2_key: string;
    preview_clip_r2_key: string;
    metadata_r2_key: string;
    duration_sec: number;
  };
}

export interface EncodingWorkerResponse {
  final_video_url: string;
  thumbnail_url: string | null;
  preview_clip_url: string | null;
  metadata_url: string;
  meta: EncodingOutputMeta;
}
