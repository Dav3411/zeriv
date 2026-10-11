/**
 * adSequence.cutPlanner.ts — Cut plan 계산.
 *
 * v0.1: cut-only assembly.
 *   - 각 scene의 safeCutFrames 기반으로 trim 구간 결정
 *   - safeCutFrames null → 전체 구간 사용 (TRIM_FALLBACK 경고)
 *   - 결과를 CutPlan으로 반환 → assembly worker에 전달
 *
 * v0.2 예정:
 *   - hold (freeze last frame), overlap (cross-fade), transition 추가
 */

import type {
  SceneJobRef,
  CutPlan,
  SceneCutPlan,
  AssemblyWarning,
  SequenceCollectResult,
} from "./adSequence.types";

export interface CutPlanResult {
  cutPlan: CutPlan;
  warnings: AssemblyWarning[];
}

/**
 * 모든 완료된 scene refs에서 CutPlan을 계산한다.
 *
 * @param sceneRefs  scene_job_refs (status=completed인 것만 사용)
 * @param fps        최종 영상 fps (snapshot.outputOptions.fps 또는 scene fps 중 최소값)
 * @param width      최종 영상 너비
 * @param height     최종 영상 높이
 */
export function buildCutPlan(
  sceneRefs: SceneJobRef[],
  fps: number,
  width: number,
  height: number
): CutPlanResult {
  const warnings: AssemblyWarning[] = [];

  // completed 씬만 사용, order 순 정렬
  const activeRefs = [...sceneRefs]
    .filter((r) => r.status === "completed" && r.outputMetadata != null)
    .sort((a, b) => a.order - b.order);

  // skipped 씬 경고
  for (const ref of sceneRefs.filter((r) => r.status === "skipped")) {
    warnings.push({
      code: "SCENE_SKIPPED",
      sceneId: ref.sceneId,
      message: `Optional scene "${ref.sceneId}" (${ref.category}) was skipped — render failed`,
    });
  }

  const scenes: SceneCutPlan[] = [];
  let totalDurationSec = 0;

  for (const ref of activeRefs) {
    const meta = ref.outputMetadata!;
    const totalSec = meta.durationSec;
    const sceneFps = meta.fps;

    let trimStartSec = 0;
    let trimEndSec = totalSec;

    if (meta.safeCutFrames) {
      trimStartSec = meta.safeCutFrames.startFrame / sceneFps;
      trimEndSec = meta.safeCutFrames.endFrame / sceneFps;
    } else {
      warnings.push({
        code: "TRIM_FALLBACK",
        sceneId: ref.sceneId,
        message: `Scene "${ref.sceneId}" has no safeCutFrames — using full duration (${totalSec}s)`,
      });
    }

    // Clamp to valid range
    trimStartSec = Math.max(0, trimStartSec);
    trimEndSec = Math.min(totalSec, trimEndSec);
    const usedDurationSec = trimEndSec - trimStartSec;

    if (usedDurationSec < 1) {
      warnings.push({
        code: "DURATION_SHORT",
        sceneId: ref.sceneId,
        message: `Scene "${ref.sceneId}" usedDuration is ${usedDurationSec.toFixed(2)}s (< 1s after trim)`,
      });
    }

    totalDurationSec += usedDurationSec;

    // R2 key from URL: strip leading slash from pathname
    const url = meta.assets.finalSceneUrl;
    let inputVideoKey: string;
    try {
      inputVideoKey = new URL(url).pathname.replace(/^\//, "");
    } catch {
      inputVideoKey = url; // already a key
    }

    scenes.push({
      sceneId: ref.sceneId,
      sceneJobId: ref.sceneJobId!,
      order: ref.order,
      category: ref.category,
      templateCode: ref.templateCode,
      inputVideoKey,
      totalDurationSec: totalSec,
      trimStartSec,
      trimEndSec,
      usedDurationSec,
    });
  }

  return {
    cutPlan: {
      assemblyType: "cut_only",
      scenes,
      totalDurationSec,
      fps,
      width,
      height,
    },
    warnings,
  };
}

/**
 * 시퀀스 output options에서 최종 assembly fps/해상도를 결정.
 *
 * 우선순위:
 *   1. outputOptions.fps / resolution이 명시되면 그 값 사용
 *   2. 없으면 완료된 scene들의 공통 값 사용 (최소 fps, 가장 작은 해상도)
 *   3. scene 값도 없으면 기본값 (30fps, 1080×1920)
 */
export function resolveAssemblyResolution(
  sceneRefs: SceneJobRef[],
  fpsPref?: number,
  resPref?: { width: number; height: number }
): { fps: number; width: number; height: number } {
  const completed = sceneRefs.filter(
    (r) => r.status === "completed" && r.outputMetadata
  );

  const fps =
    fpsPref ??
    (completed.length > 0
      ? Math.min(...completed.map((r) => r.outputMetadata!.fps))
      : 30);

  const width =
    resPref?.width ??
    (completed.length > 0
      ? Math.min(...completed.map((r) => r.outputMetadata!.width))
      : 1080);

  const height =
    resPref?.height ??
    (completed.length > 0
      ? Math.min(...completed.map((r) => r.outputMetadata!.height))
      : 1920);

  return { fps, width, height };
}

/**
 * SequenceCollectResult(type="scene_bundle") → CutPlan 변환.
 *
 * sequence_resolving 단계에서 호출.
 * safeCutFrames 기반으로 trim 구간을 결정하고, CutPlan을 생성한다.
 */
export function buildCutPlanFromCollectResult(
  bundle: SequenceCollectResult,
  fps: number,
  width: number,
  height: number
): CutPlanResult {
  const warnings: AssemblyWarning[] = [];
  const scenes: SceneCutPlan[] = [];
  let totalDurationSec = 0;

  const sorted = [...bundle.orderedScenes].sort((a, b) => a.order - b.order);

  if (bundle.skippedCount > 0) {
    warnings.push({
      code: "SCENE_SKIPPED",
      message: `${bundle.skippedCount} optional scene(s) were skipped during collection`,
    });
  }

  for (const entry of sorted) {
    const totalSec = entry.durationSec;
    const sceneFps = entry.fps;

    let trimStartSec = 0;
    let trimEndSec = totalSec;

    if (entry.safeCutFrames) {
      trimStartSec = entry.safeCutFrames.startFrame / sceneFps;
      trimEndSec   = entry.safeCutFrames.endFrame   / sceneFps;
    } else {
      warnings.push({
        code: "TRIM_FALLBACK",
        sceneId: entry.sceneId,
        message: `Scene "${entry.sceneId}" has no safeCutFrames — using full duration (${totalSec}s)`,
      });
    }

    trimStartSec = Math.max(0, trimStartSec);
    trimEndSec   = Math.min(totalSec, Math.max(trimStartSec, trimEndSec));
    const usedDurationSec = trimEndSec - trimStartSec;

    if (usedDurationSec < 1) {
      warnings.push({
        code: "DURATION_SHORT",
        sceneId: entry.sceneId,
        message: `Scene "${entry.sceneId}" usedDuration is ${usedDurationSec.toFixed(2)}s (< 1s after trim)`,
      });
    }

    totalDurationSec += usedDurationSec;

    let inputVideoKey: string;
    try {
      inputVideoKey = new URL(entry.finalSceneUrl).pathname.replace(/^\//, "");
    } catch {
      inputVideoKey = entry.finalSceneUrl;
    }

    scenes.push({
      sceneId: entry.sceneId,
      sceneJobId: entry.sceneJobId,
      order: entry.order,
      category: entry.category,
      templateCode: entry.templateCode,
      inputVideoKey,
      totalDurationSec: totalSec,
      trimStartSec,
      trimEndSec,
      usedDurationSec,
    });
  }

  return {
    cutPlan: { assemblyType: "cut_only", scenes, totalDurationSec, fps, width, height },
    warnings,
  };
}
