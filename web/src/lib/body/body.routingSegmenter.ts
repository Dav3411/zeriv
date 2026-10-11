/**
 * body.routingSegmenter.ts — Pose sequence → C1/C2/C3 reference routing
 *
 * Analyzes per-frame pose keypoints and decides which canonical reference
 * (C1 front_neutral / C2 three_quarter / C3 raised_arm) should be the
 * primary reference for each segment of the motion.
 *
 * Pose data format expected:
 *   {
 *     frames: Array<{
 *       frameIndex: number;
 *       keypoints: {
 *         [name: string]: { x: number; y: number; confidence?: number }
 *       }
 *     }>
 *   }
 *
 * Keypoint names follow MediaPipe/OpenPose conventions:
 *   leftShoulder, rightShoulder, leftWrist, rightWrist,
 *   leftHip, rightHip, leftElbow, rightElbow
 */

import type { CanonicalRef, MotionSegment, RoutingPlan } from "@/lib/body/body.types";

// ─── Thresholds (tunable) ─────────────────────────────────────────────────────

/** Wrist above shoulder by this fraction of frame height → arm is raised */
const ARM_ELEVATION_THRESHOLD = 0.04;

/** Shoulder width below this fraction of frame width → torso is rotated */
const TORSO_ROTATION_THRESHOLD = 0.15;

/** Merge segments shorter than this many frames into neighbors */
const MIN_SEGMENT_FRAMES = 6;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Keypoint {
  x: number;
  y: number;
  confidence?: number;
}

interface PoseFrame {
  frameIndex: number;
  keypoints: Record<string, Keypoint | undefined>;
}

interface PoseData {
  frames: PoseFrame[];
}

// ─── Per-frame analysis ───────────────────────────────────────────────────────

function armElevation(frame: PoseFrame): number {
  const ls = frame.keypoints["leftShoulder"];
  const rs = frame.keypoints["rightShoulder"];
  const lw = frame.keypoints["leftWrist"];
  const rw = frame.keypoints["rightWrist"];
  const le = frame.keypoints["leftElbow"];
  const re = frame.keypoints["rightElbow"];

  if (!ls || !rs) return 0;

  const shoulderY = (ls.y + rs.y) / 2;

  // Wrist above shoulder: y decreases upward (0=top of frame)
  const leftWristElevation = lw ? Math.max(0, shoulderY - lw.y) : 0;
  const rightWristElevation = rw ? Math.max(0, shoulderY - rw.y) : 0;

  // Elbow above shoulder also signals raising motion (early indicator)
  const leftElbowElevation = le ? Math.max(0, shoulderY - le.y) * 0.5 : 0;
  const rightElbowElevation = re ? Math.max(0, shoulderY - re.y) * 0.5 : 0;

  return Math.max(
    leftWristElevation,
    rightWristElevation,
    leftElbowElevation,
    rightElbowElevation
  );
}

function torsoRotation(frame: PoseFrame): number {
  const ls = frame.keypoints["leftShoulder"];
  const rs = frame.keypoints["rightShoulder"];
  const lh = frame.keypoints["leftHip"];
  const rh = frame.keypoints["rightHip"];

  if (!ls || !rs) return 0;

  const shoulderWidth = Math.abs(rs.x - ls.x);

  // Also compare shoulder vs hip width asymmetry for rotation estimate
  let hipWidth = shoulderWidth;
  if (lh && rh) hipWidth = Math.abs(rh.x - lh.x);

  // In a neutral frontal view, shoulder and hip widths are both ~0.25–0.35.
  // In 3/4 view they shrink. Use the smaller of the two as rotation indicator.
  const apparentWidth = Math.min(shoulderWidth, hipWidth);

  // Normalize: full frontal ~0.30 width → score 0; side ~0.10 → score ~0.67
  return Math.max(0, 1 - apparentWidth / 0.30);
}

function classifyFrame(frame: PoseFrame): CanonicalRef {
  const elevation = armElevation(frame);
  const rotation = torsoRotation(frame);

  if (elevation >= ARM_ELEVATION_THRESHOLD) return "c3"; // raised arm wins
  if (rotation >= TORSO_ROTATION_THRESHOLD) return "c2"; // three quarter
  return "c1"; // front neutral
}

// ─── Segment merging ──────────────────────────────────────────────────────────

function mergeShortSegments(segments: MotionSegment[]): MotionSegment[] {
  if (segments.length <= 1) return segments;

  let changed = true;
  let segs = [...segments];

  while (changed) {
    changed = false;
    const next: MotionSegment[] = [];

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const segLen = seg.endFrame - seg.startFrame + 1;

      if (segLen < MIN_SEGMENT_FRAMES && next.length > 0) {
        // Merge into previous segment
        next[next.length - 1] = {
          ...next[next.length - 1],
          endFrame: seg.endFrame,
        };
        changed = true;
      } else {
        next.push(seg);
      }
    }

    segs = next;
  }

  return segs;
}

// ─── Main segmenter ───────────────────────────────────────────────────────────

/**
 * Compute routing plan from parsed pose data JSON.
 * Returns a RoutingPlan with merged motion segments.
 */
export function computeRoutingPlan(poseData: PoseData): RoutingPlan {
  const { frames } = poseData;

  if (!frames || frames.length === 0) {
    return { segments: [{ startFrame: 0, endFrame: 0, primaryRef: "c1" }], totalFrames: 0 };
  }

  // Classify each frame
  const refs: CanonicalRef[] = frames.map(classifyFrame);

  // Build raw segments (consecutive same-ref runs)
  const raw: MotionSegment[] = [];
  let segStart = 0;
  let currentRef = refs[0];

  for (let i = 1; i <= refs.length; i++) {
    if (i === refs.length || refs[i] !== currentRef) {
      raw.push({ startFrame: segStart, endFrame: i - 1, primaryRef: currentRef });
      segStart = i;
      if (i < refs.length) currentRef = refs[i];
    }
  }

  const segments = mergeShortSegments(raw);

  return { segments, totalFrames: frames.length };
}

/**
 * Parse raw pose data JSON (unknown shape) into typed PoseData.
 * Handles multiple common pose JSON formats gracefully.
 */
export function parsePoseData(raw: unknown): PoseData {
  if (typeof raw !== "object" || raw === null) {
    return { frames: [] };
  }

  const obj = raw as Record<string, unknown>;

  // Standard format: { frames: [...] }
  if (Array.isArray(obj["frames"])) {
    return { frames: obj["frames"] as PoseFrame[] };
  }

  // Flat array format: [ { frameIndex, keypoints }, ... ]
  if (Array.isArray(raw)) {
    return { frames: raw as PoseFrame[] };
  }

  return { frames: [] };
}
