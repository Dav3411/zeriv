/**
 * face.signal.ts — Face Signal 로드 및 메타데이터 추출
 *
 * face_signal.json의 구조를 검사하고 downstream에 필요한 메타데이터를
 * 추출한다. 실제 smoothing/normalization은 Python worker에서 수행한다.
 *
 * 지원 face_signal.json 형식:
 *   통합형: { fps, frames: [{ frameIndex, headPose, mouthOpenness, eyeOpenness, expression }] }
 *   배열형: [{ frameIndex, ... }]
 */

import type { FaceSignalMeta } from "@/lib/face/face.types";

interface SignalFrame {
  frameIndex?: number;
  headPose?: { yaw?: number; pitch?: number; roll?: number };
  mouthOpenness?: number;
  eyeOpenness?: { left?: number; right?: number };
  expression?: Record<string, number>;
}

interface RawFaceSignal {
  fps?: number;
  frames?: SignalFrame[];
}

export interface FaceSignalLoadResult {
  meta: FaceSignalMeta;
  /** Whether the signal JSON is structurally valid enough to use */
  valid: boolean;
  error?: string;
}

/**
 * Fetch and inspect a face_signal.json URL.
 * Does NOT download the full signal for storage — that's handled by the Python worker.
 * Returns metadata only.
 */
export async function loadFaceSignalMeta(
  faceSignalUrl: string,
  expectedFps: number,
  expectedDurationSec: number
): Promise<FaceSignalLoadResult> {
  let raw: unknown;
  try {
    const res = await fetch(faceSignalUrl);
    if (!res.ok) {
      return {
        meta: emptyMeta(expectedFps),
        valid: false,
        error: `HTTP ${res.status} fetching face signal`,
      };
    }
    raw = await res.json();
  } catch (err) {
    return {
      meta: emptyMeta(expectedFps),
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return parseFaceSignalMeta(raw, expectedFps, expectedDurationSec);
}

function emptyMeta(fps: number): FaceSignalMeta {
  return {
    frameCount: 0,
    fps,
    hasHeadPose: false,
    hasExpression: false,
    hasMouth: false,
    hasEyes: false,
  };
}

function parseFaceSignalMeta(
  raw: unknown,
  expectedFps: number,
  expectedDurationSec: number
): FaceSignalLoadResult {
  if (typeof raw !== "object" || raw === null) {
    return { meta: emptyMeta(expectedFps), valid: false, error: "face_signal.json is not an object" };
  }

  const obj = raw as RawFaceSignal;
  const frames: SignalFrame[] = Array.isArray(obj.frames)
    ? obj.frames
    : Array.isArray(raw)
    ? (raw as SignalFrame[])
    : [];

  if (frames.length === 0) {
    return { meta: emptyMeta(expectedFps), valid: false, error: "face_signal.json contains no frames" };
  }

  const fps = obj.fps ?? expectedFps;
  const expectedFrames = Math.round(expectedDurationSec * expectedFps);

  // Tolerate ±10% frame count mismatch (resampling is possible downstream)
  const frameDiff = Math.abs(frames.length - expectedFrames) / Math.max(1, expectedFrames);
  if (frameDiff > 0.15) {
    return {
      meta: emptyMeta(fps),
      valid: false,
      error: `Frame count mismatch: signal has ${frames.length} frames, expected ~${expectedFrames}`,
    };
  }

  // Sample first non-null frame to detect available channels
  const sample = frames.find((f) => f != null) ?? {};

  const meta: FaceSignalMeta = {
    frameCount: frames.length,
    fps,
    hasHeadPose: sample.headPose !== undefined,
    hasExpression: sample.expression !== undefined,
    hasMouth: sample.mouthOpenness !== undefined,
    hasEyes: sample.eyeOpenness !== undefined,
  };

  return { meta, valid: true };
}
