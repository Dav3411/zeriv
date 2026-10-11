/**
 * adSequence.assembler.ts — Cut-only video assembly using FFmpeg.
 *
 * 역할:
 *   - scene 영상 R2 다운로드 → temp 파일
 *   - FFmpeg filter_complex concat (trim + scale + setpts per scene)
 *   - 썸네일 추출 (first keyframe near 0.5s)
 *   - 결과물 R2 업로드 → 공개 URL 반환
 *   - temp 파일 정리
 *
 * v0.1 제약:
 *   - audio track 없음 (video-only)
 *   - transition 없음 (cut-only)
 *   - scale 전략: force_original_aspect_ratio=decrease + centered pad
 *
 * 환경 변수:
 *   R2_BUCKET        — 업로드 대상 버킷
 *   R2_PUBLIC_URL    — 공개 URL base (trailing slash 제거 후 사용)
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { Readable } from "node:stream";

import { getObjectFromR2, uploadBufferToR2 } from "@/lib/r2";
import type { CutPlan, SceneCutPlan } from "./adSequence.types";

const execFileAsync = promisify(execFile);

const R2_BUCKET    = process.env.R2_BUCKET      ?? "";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AssemblyInput {
  adJobId: string;
  cutPlan: CutPlan;
}

export interface AssemblyOutput {
  finalAdVideoUrl: string;
  thumbnailUrl: string;
  /** v0.1: always null — preview clip generation deferred */
  previewClipUrl: null;
  /** measured durationSec from ffprobe after concat */
  measuredDurationSec: number;
  /** total wall-clock ms for the whole assembly */
  assemblyDurationMs: number;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * CutPlan을 입력받아 최종 광고 영상을 생성하고 R2에 업로드한다.
 *
 * @throws Error  FFmpeg 실패 / R2 업로드 실패 / 입력 누락
 */
export async function assembleCutOnly(input: AssemblyInput): Promise<AssemblyOutput> {
  const { adJobId, cutPlan } = input;
  const startMs = Date.now();

  if (!R2_BUCKET) throw new Error("R2_BUCKET env not configured");
  if (cutPlan.scenes.length === 0) throw new Error("cutPlan has no scenes");

  const tmpDir = path.join(tmpdir(), `seq-${adJobId}-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const tempPaths: string[] = [tmpDir];

  try {
    // ── 1. Download scene videos
    const localPaths = await downloadSceneVideos(cutPlan.scenes, tmpDir);

    // ── 2. FFmpeg concat + scale → merged video
    const mergedPath = path.join(tmpDir, "merged.mp4");
    await runFfmpegConcat(cutPlan, localPaths, mergedPath);

    // ── 3. Probe actual duration from merged video
    const measuredDurationSec = await probeDuration(mergedPath);

    // ── 4. Extract thumbnail
    const thumbPath = path.join(tmpDir, "thumbnail.jpg");
    await extractThumbnail(mergedPath, thumbPath);

    // ── 5. Upload to R2
    const ts = Date.now();
    const videoKey = `ad-sequences/${adJobId}/final_ad_${ts}.mp4`;
    const thumbKey = `ad-sequences/${adJobId}/thumbnail_${ts}.jpg`;

    await uploadFileToR2(mergedPath, videoKey, "video/mp4");
    await uploadFileToR2(thumbPath, thumbKey, "image/jpeg");

    const finalAdVideoUrl = `${R2_PUBLIC_URL}/${videoKey}`;
    const thumbnailUrl    = `${R2_PUBLIC_URL}/${thumbKey}`;

    return {
      finalAdVideoUrl,
      thumbnailUrl,
      previewClipUrl: null,
      measuredDurationSec,
      assemblyDurationMs: Date.now() - startMs,
    };
  } finally {
    // ── Cleanup temp dir (best-effort)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Download helpers ─────────────────────────────────────────────────────────

async function downloadSceneVideos(
  scenes: SceneCutPlan[],
  tmpDir: string
): Promise<Map<string, string>> {
  const localPaths = new Map<string, string>();

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const localPath = path.join(tmpDir, `scene_${i}_${scene.sceneId}.mp4`);
    await downloadR2ToFile(scene.inputVideoKey, localPath);
    localPaths.set(scene.sceneId, localPath);
  }

  return localPaths;
}

async function downloadR2ToFile(r2Key: string, destPath: string): Promise<void> {
  const { body } = await getObjectFromR2({ bucket: R2_BUCKET, key: r2Key });
  if (!body) throw new Error(`R2 object empty or missing: ${r2Key}`);

  const stream =
    body instanceof Readable
      ? body
      : Readable.from(Buffer.from(await (body as Blob).arrayBuffer()));

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  await fs.writeFile(destPath, Buffer.concat(chunks));
}

// ─── FFmpeg concat ────────────────────────────────────────────────────────────

/**
 * filter_complex concat (cut-only, no audio, trim + scale per scene).
 *
 * 각 씬:
 *   [i:v]trim=start=T1:end=T2,setpts=PTS-STARTPTS,
 *        scale=W:H:force_original_aspect_ratio=decrease,
 *        pad=W:H:(ow-iw)/2:(oh-ih)/2[vi]
 *
 * 최종:
 *   [v0][v1]...[vN-1]concat=n=N:v=1:a=0[vout]
 *
 * 인코딩: libx264 fast, crf 22, target fps
 */
async function runFfmpegConcat(
  cutPlan: CutPlan,
  localPaths: Map<string, string>,
  outPath: string
): Promise<void> {
  const { scenes, fps, width, height } = cutPlan;

  // Build -i arguments
  const inputArgs: string[] = [];
  for (const scene of scenes) {
    const localPath = localPaths.get(scene.sceneId);
    if (!localPath) throw new Error(`Local path missing for scene ${scene.sceneId}`);
    inputArgs.push("-i", localPath);
  }

  // Build filter_complex
  const filterParts: string[] = [];
  const outputLabels: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const label = `v${i}`;
    outputLabels.push(`[${label}]`);

    // trim + normalize timestamps + scale to target resolution
    filterParts.push(
      `[${i}:v]` +
      `trim=start=${scene.trimStartSec.toFixed(6)}:end=${scene.trimEndSec.toFixed(6)},` +
      `setpts=PTS-STARTPTS,` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `fps=${fps}` +
      `[${label}]`
    );
  }

  // Concat filter
  filterParts.push(
    `${outputLabels.join("")}concat=n=${scenes.length}:v=1:a=0[vout]`
  );

  const filterComplex = filterParts.join(";");

  const ffmpegArgs = [
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",
    "-movflags", "+faststart",
    "-y",
    outPath,
  ];

  try {
    await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 240_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`FFmpeg concat failed: ${msg}`);
  }
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

async function extractThumbnail(videoPath: string, outPath: string): Promise<void> {
  // Seek to 0.5s (or start if video < 0.5s), extract 1 frame at quality 2
  const args = [
    "-i", videoPath,
    "-ss", "0.5",
    "-vframes", "1",
    "-q:v", "2",
    "-y",
    outPath,
  ];
  try {
    await execFileAsync("ffmpeg", args, { timeout: 30_000 });
  } catch {
    // Fallback: try from very start
    const fallbackArgs = [
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "2",
      "-y",
      outPath,
    ];
    await execFileAsync("ffmpeg", fallbackArgs, { timeout: 30_000 });
  }
}

// ─── Duration probe ───────────────────────────────────────────────────────────

async function probeDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        videoPath,
      ],
      { timeout: 15_000 }
    );
    const val = parseFloat(stdout.trim());
    return isNaN(val) ? 0 : val;
  } catch {
    return 0; // non-fatal: CutPlan.totalDurationSec used as fallback
  }
}

// ─── R2 upload ────────────────────────────────────────────────────────────────

async function uploadFileToR2(
  localPath: string,
  r2Key: string,
  contentType: string
): Promise<void> {
  const body = await fs.readFile(localPath);
  await uploadBufferToR2({ bucket: R2_BUCKET, key: r2Key, contentType, body });
}
