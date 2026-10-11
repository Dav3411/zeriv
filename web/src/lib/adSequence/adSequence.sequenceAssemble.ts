/**
 * adSequence.sequenceAssemble.ts — /api/internal/sequence-assemble service.
 *
 * 역할:
 *   1. ad_sequence_jobs 로드 (assembly_preparing 단계 확인)
 *   2. cut_plan 컬럼에서 SequenceCollectResult 또는 CutPlan 로드
 *   3. scene_bundle → CutPlan 변환 (buildCutPlanFromCollectResult)
 *   4. assembly_rendering 전환 → assembleCutOnly() 호출
 *   5. assembly_encoding 전환 → AdSequenceOutputMetadata 구성
 *   6. assembly_completed 전환 → DB 저장
 *   7. notifySequenceComplete() → campaign_sequences 연결
 *   8. logSeqComplete / logSeqFailed
 *
 * ─── 에러 코드 ──────────────────────────────────────────────────────────────
 *   BUNDLE_MISSING        — cut_plan이 없거나 null
 *   BUNDLE_TYPE_INVALID   — cut_plan.type이 "scene_bundle"도 "cut_only"도 아님
 *   BUNDLE_NO_SCENES      — orderedScenes / scenes가 비어 있음
 *   SCENE_URL_MISSING     — scene의 finalSceneUrl / inputVideoKey가 없음
 *   FFMPEG_FAILED         — FFmpeg 실패
 *   R2_UPLOAD_FAILED      — R2 업로드 실패
 *
 * ─── TODO ────────────────────────────────────────────────────────────────────
 *   - previewClipUrl 생성 (short clip, 6–9s)
 *   - transitionChecks: checkTransitionCompatibility() 연결
 *   - targetDurationSec miss 경고 (DURATION_TARGET_MISS)
 *   - ENCODING_WORKER_URL 환경변수로 외부 worker 분리 (현재 inline)
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { transitionSequenceStage } from "./adSequence.stage";
import { notifySequenceComplete } from "./adSequence.orchestrator";
import {
  buildCutPlanFromCollectResult,
  resolveAssemblyResolution,
} from "./adSequence.cutPlanner";
import { assembleCutOnly } from "./adSequence.assembler";
import { logSeqComplete, logSeqFailed } from "@/lib/adRender/adRender.logger";
import type {
  AdSequenceJobSnapshot,
  AdSequenceOutputMetadata,
  SequenceCollectResult,
  CutPlan,
  AssemblyWarning,
  SceneJobRef,
  SequenceValidationResult,
} from "./adSequence.types";

// ─── Result type ──────────────────────────────────────────────────────────────

export type AssembleOutcome = "completed" | "failed" | "skipped";

export interface SequenceAssembleResult {
  outcome: AssembleOutcome;
  adJobId: string;
  finalAdVideoUrl?: string;
  totalDurationSec?: number;
  assemblyDurationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function runSequenceAssemble(
  adJobId: string,
): Promise<SequenceAssembleResult> {
  const startMs = Date.now();

  // ── 1. Load job row
  const { data: row, error: fetchError } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .select(
      "id, current_stage, job_snapshot, scene_job_refs, cut_plan, validation_result, generation_session_id, brand_profile_snapshot",
    )
    .eq("id", adJobId)
    .single();

  if (fetchError || !row) {
    throw new Error(`sequence-assemble: job not found (adJobId=${adJobId})`);
  }

  const r = row as Record<string, unknown>;
  const currentStage = r.current_stage as string;

  // ── 2. Idempotency
  if (
    currentStage !== "assembly_preparing" &&
    currentStage !== "assembly_rendering"
  ) {
    return { outcome: "skipped", adJobId };
  }

  const snapshot = r.job_snapshot as AdSequenceJobSnapshot;
  const sceneJobRefs = (r.scene_job_refs as SceneJobRef[]) ?? [];
  const rawCutPlan = r.cut_plan as Record<string, unknown> | null;
  const validationResult =
    (r.validation_result as SequenceValidationResult | null) ?? null;

  // ── 3. Load and validate bundle / cut plan
  const cutPlanResult = resolveCutPlan(rawCutPlan, snapshot, sceneJobRefs);
  if ("errorCode" in cutPlanResult) {
    await failAssembly(
      adJobId,
      cutPlanResult.errorCode,
      cutPlanResult.errorMessage,
    );
    logSeqFailed(adJobId, {
      reason: cutPlanResult.errorMessage,
      stage: "assembly_preparing",
    });
    return {
      outcome: "failed",
      adJobId,
      errorCode: cutPlanResult.errorCode,
      errorMessage: cutPlanResult.errorMessage,
    };
  }

  const { cutPlan, extraWarnings } = cutPlanResult;

  // Validate scene URLs
  const urlCheck = validateSceneUrls(cutPlan);
  if (urlCheck) {
    await failAssembly(adJobId, urlCheck.errorCode, urlCheck.errorMessage);
    logSeqFailed(adJobId, {
      reason: urlCheck.errorMessage,
      stage: "assembly_preparing",
    });
    return { outcome: "failed", adJobId, ...urlCheck };
  }

  // ── 4. Transition → assembly_rendering
  await transitionSequenceStage(adJobId, "assembly_rendering");

  // ── 5. Run assembly
  let assemblyOutput: Awaited<ReturnType<typeof assembleCutOnly>>;
  try {
    assemblyOutput = await assembleCutOnly({ adJobId, cutPlan });
  } catch (err) {
    const msg = String(err);
    const code = msg.startsWith("FFmpeg")
      ? "FFMPEG_FAILED"
      : "R2_UPLOAD_FAILED";
    console.error(
      JSON.stringify({ action: "assembly_failed", adJobId, error: msg }),
    );
    await failAssembly(adJobId, code, msg);
    logSeqFailed(adJobId, { reason: msg, stage: "assembly_rendering" });
    return { outcome: "failed", adJobId, errorCode: code, errorMessage: msg };
  }

  // ── 6. Transition → assembly_encoding (metadata construction phase)
  await transitionSequenceStage(adJobId, "assembly_encoding");

  // ── 7. Build AdSequenceOutputMetadata
  const durationSec =
    assemblyOutput.measuredDurationSec > 0
      ? assemblyOutput.measuredDurationSec
      : cutPlan.totalDurationSec;

  const { targetDurationSec } = snapshot.outputOptions;
  const assemblyWarnings: AssemblyWarning[] = [...extraWarnings];

  // Warn if actual duration misses target by > 20%
  if (
    targetDurationSec &&
    Math.abs(durationSec - targetDurationSec) / targetDurationSec > 0.2
  ) {
    assemblyWarnings.push({
      code: "TARGET_DURATION_MISS",
      message: `Target ${targetDurationSec}s, actual ${durationSec.toFixed(2)}s (>20% deviation)`,
    });
  }

  const completedAt = new Date().toISOString();
  const assemblyDurationMs = Date.now() - startMs;

  const outputMetadata: AdSequenceOutputMetadata = {
    adJobId,
    finalAdVideoUrl: assemblyOutput.finalAdVideoUrl,
    thumbnailUrl: assemblyOutput.thumbnailUrl,
    previewClipUrl: assemblyOutput.previewClipUrl,
    orderedScenes: cutPlan.scenes.map((s) => ({
      order: s.order,
      sceneId: s.sceneId,
      sceneJobId: s.sceneJobId,
      category: s.category,
      templateCode: s.templateCode,
      cutPlan: s,
    })),
    cutPlan,
    durationSummary: {
      totalDurationSec: durationSec,
      perScene: cutPlan.scenes.map((s) => ({
        sceneId: s.sceneId,
        category: s.category,
        usedDurationSec: s.usedDurationSec,
      })),
    },
    transitionChecks: [], // TODO: checkTransitionCompatibility() per adjacent scene pair
    assemblyWarnings,
    validationSummary: validationResult ?? { valid: true, warnings: [] },
    renderDurationMs: assemblyDurationMs,
    completedAt,
  };

  // ── 8. Transition → assembly_completed
  await transitionSequenceStage(adJobId, "assembly_completed", {
    outputMetadata,
    cutPlan,
  });

  // ── 9. Notify campaign (non-blocking)
  await notifySequenceComplete(adJobId, outputMetadata);

  // ── 10. Log
  const appliedAssetCount = snapshot.appliedAssets?.length ?? 0;
  logSeqComplete(adJobId, {
    totalDurationSec: durationSec,
    sceneCount: cutPlan.scenes.length,
    renderDurationMs: assemblyDurationMs,
    appliedAssetCount,
    warningCount: assemblyWarnings.length,
    finalAdVideoUrl: assemblyOutput.finalAdVideoUrl,
  });

  return {
    outcome: "completed",
    adJobId,
    finalAdVideoUrl: assemblyOutput.finalAdVideoUrl,
    totalDurationSec: durationSec,
    assemblyDurationMs,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CutPlanResolveError = { errorCode: string; errorMessage: string };
type CutPlanResolveOk = { cutPlan: CutPlan; extraWarnings: AssemblyWarning[] };

/**
 * cut_plan 컬럼 값에서 CutPlan을 결정.
 *
 * 두 가지 형태를 처리:
 *   type="scene_bundle"     → buildCutPlanFromCollectResult() 로 변환
 *   assemblyType="cut_only" → 이미 CutPlan, 그대로 사용
 */
function resolveCutPlan(
  raw: Record<string, unknown> | null,
  snapshot: AdSequenceJobSnapshot,
  sceneJobRefs: SceneJobRef[],
): CutPlanResolveOk | CutPlanResolveError {
  if (!raw) {
    return {
      errorCode: "BUNDLE_MISSING",
      errorMessage: "cut_plan is null — collect step may not have run",
    };
  }

  // Already a final CutPlan
  if (raw.assemblyType === "cut_only") {
    const cp = raw as unknown as CutPlan;
    if (!cp.scenes?.length) {
      return {
        errorCode: "BUNDLE_NO_SCENES",
        errorMessage: "CutPlan.scenes is empty",
      };
    }
    return { cutPlan: cp, extraWarnings: [] };
  }

  // SequenceCollectResult
  if (raw.type === "scene_bundle") {
    const bundle = raw as unknown as SequenceCollectResult;
    if (!bundle.orderedScenes?.length) {
      return {
        errorCode: "BUNDLE_NO_SCENES",
        errorMessage: "SequenceCollectResult.orderedScenes is empty",
      };
    }

    const { fps, width, height } = resolveAssemblyResolution(
      sceneJobRefs,
      snapshot?.outputOptions?.fps,
      snapshot?.outputOptions?.resolution,
    );
    const { cutPlan, warnings } = buildCutPlanFromCollectResult(
      bundle,
      fps,
      width,
      height,
    );
    return { cutPlan, extraWarnings: warnings };
  }

  return {
    errorCode: "BUNDLE_TYPE_INVALID",
    errorMessage: `cut_plan has unexpected type: ${String(raw.type ?? raw.assemblyType)}`,
  };
}

/** 모든 scene의 inputVideoKey가 비어 있지 않은지 확인. */
function validateSceneUrls(cutPlan: CutPlan): CutPlanResolveError | null {
  for (const scene of cutPlan.scenes) {
    if (!scene.inputVideoKey?.trim()) {
      return {
        errorCode: "SCENE_URL_MISSING",
        errorMessage: `Scene "${scene.sceneId}" (order=${scene.order}) has no inputVideoKey`,
      };
    }
  }
  return null;
}

async function failAssembly(
  adJobId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await transitionSequenceStage(adJobId, "assembly_failed", {
    errorCode,
    errorMessage,
  });
}
