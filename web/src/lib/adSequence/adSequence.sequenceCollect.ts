/**
 * adSequence.sequenceCollect.ts — /api/internal/sequence-collect service.
 *
 * 역할:
 *   1. ad_sequence_jobs.scene_job_refs 로드
 *   2. 연결된 scene_render_jobs 일괄 조회
 *   3. 각 ref status 갱신 (completed / failed / skipped / rendering)
 *   4. required 씬 실패 → scene_collection_failed
 *   5. 미완료 씬 있음 → collect_attempt_count 증가 + re-enqueue (최대 60회)
 *   6. 전부 완료 → SequenceCollectResult 빌드 → sequence_resolving + assembly_preparing 전환
 *
 * ─── 에러 코드 ─────────────────────────────────────────────────────────────────
 *   SCENE_RENDER_FAILED     — required scene의 status=scene_failed
 *   SCENE_OUTPUT_MISSING    — scene completed 이지만 output_metadata 없음
 *   ENCODE_QUALITY_FAILED   — required scene의 stageResults.scene_encode.passed=false
 *   COLLECT_TIMEOUT         — collect_attempt_count > MAX_COLLECT_ATTEMPTS
 *
 * ─── TODO ─────────────────────────────────────────────────────────────────────
 *   - collect_result 전용 JSONB 컬럼 마이그레이션 (현재 cut_plan에 임시 저장)
 *   - collect_attempt_count 컬럼 마이그레이션 (현재 job_snapshot에 없으면 0 폴백)
 *   - sequence_resolving: SequenceCollectResult → CutPlan 변환 구현 (cut plan 계산)
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  transitionSequenceStage,
  calcCollectingProgress,
} from "./adSequence.stage";
import { enqueueSequenceStep } from "./adSequence.orchestrator";
import type {
  SceneJobRef,
  AdSequenceJobSnapshot,
  CollectSceneEntry,
  SequenceCollectResult,
} from "./adSequence.types";
import type { SceneOutputMetadata } from "@/lib/sceneRender/sceneRender.types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** re-enqueue 최대 횟수. 초과 시 scene_collection_failed. */
const MAX_COLLECT_ATTEMPTS = 60;

// ─── Result type ──────────────────────────────────────────────────────────────

export type CollectOutcome =
  | "ready"              // 모든 required scene 완료 → assembly_preparing 전환됨
  | "waiting"            // 미완료 scene 있음 → re-enqueue됨
  | "collection_failed"  // required scene 실패 or 타임아웃
  | "skipped";           // idempotency: 이미 이 단계가 아님

export interface SequenceCollectServiceResult {
  outcome: CollectOutcome;
  adJobId: string;
  completedCount: number;
  totalCount: number;
  /** 실패한 required scene sceneId 목록 */
  failedRequiredSceneIds: string[];
  /** outcome=ready 시 빌드된 bundle */
  collectResult?: SequenceCollectResult;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function runSequenceCollect(
  adJobId: string
): Promise<SequenceCollectServiceResult> {
  // ── 1. Load job row
  const { data: row, error: fetchError } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .select("id, current_stage, job_snapshot, scene_job_refs, collect_attempt_count")
    .eq("id", adJobId)
    .single();

  if (fetchError || !row) {
    throw new Error(`sequence-collect: job not found (adJobId=${adJobId})`);
  }

  const r = row as Record<string, unknown>;
  const currentStage = r.current_stage as string;

  // ── 2. Idempotency
  if (currentStage !== "scene_collecting") {
    return {
      outcome: "skipped",
      adJobId,
      completedCount: 0,
      totalCount: 0,
      failedRequiredSceneIds: [],
    };
  }

  const snapshot = r.job_snapshot as AdSequenceJobSnapshot;
  const refs = (r.scene_job_refs as SceneJobRef[]) ?? [];
  const attemptCount = ((r.collect_attempt_count as number) ?? 0) + 1;

  // ── 3. Fetch all linked scene_render_jobs in one query
  const sceneJobIds = refs
    .map((ref) => ref.sceneJobId)
    .filter((id): id is string => !!id);

  const sceneJobMap = await fetchSceneJobStatuses(sceneJobIds);

  // ── 4. Update refs with live status
  const updatedRefs = refs.map((ref): SceneJobRef => {
    if (!ref.sceneJobId) return ref; // sceneJobId not yet set → still pending

    const job = sceneJobMap.get(ref.sceneJobId);
    if (!job) return ref; // DB miss — leave as-is

    if (job.status === "completed" && job.output_metadata) {
      return {
        ...ref,
        status: "completed",
        outputMetadata: job.output_metadata as SceneOutputMetadata,
        failureReason: null,
      };
    }

    if (job.status === "failed") {
      // optional=true → skip; required → fail
      const isOptional = isOptionalScene(snapshot, ref.sceneId);
      return {
        ...ref,
        status: isOptional ? "skipped" : "failed",
        failureReason: job.error_message ?? "scene_render_failed",
      };
    }

    // Still rendering
    return { ...ref, status: "rendering" };
  });

  // ── 5. Aggregate
  const failedRequired = updatedRefs.filter(
    (r) => r.status === "failed" && !isOptionalScene(snapshot, r.sceneId)
  );
  const completed = updatedRefs.filter(
    (r) => r.status === "completed" || r.status === "skipped"
  );
  const pending = updatedRefs.filter((r) => r.status === "rendering" || r.status === "creating" || r.status === "pending");
  const totalCount = updatedRefs.length;

  console.log(
    JSON.stringify({
      action: "sequence_collect_check",
      adJobId,
      attempt: attemptCount,
      total: totalCount,
      completed: completed.length,
      pending: pending.length,
      failedRequired: failedRequired.length,
    })
  );

  // ── 6. Hard fail: required scene failed
  if (failedRequired.length > 0) {
    const failedIds = failedRequired.map((r) => r.sceneId);
    const reasons = failedRequired
      .map((r) => `${r.sceneId}(${r.failureReason ?? "unknown"})`)
      .join(", ");

    await transitionSequenceStage(adJobId, "scene_collection_failed", {
      sceneJobRefs: updatedRefs,
      errorCode: "SCENE_RENDER_FAILED",
      errorMessage: `Required scene(s) failed: ${reasons}`,
    });

    return {
      outcome: "collection_failed",
      adJobId,
      completedCount: completed.length,
      totalCount,
      failedRequiredSceneIds: failedIds,
      errorCode: "SCENE_RENDER_FAILED",
      errorMessage: `Required scene(s) failed: ${reasons}`,
    };
  }

  // ── 7. Timeout: too many attempts
  if (pending.length > 0 && attemptCount > MAX_COLLECT_ATTEMPTS) {
    const pendingIds = pending.map((r) => r.sceneId).join(", ");
    await transitionSequenceStage(adJobId, "scene_collection_failed", {
      sceneJobRefs: updatedRefs,
      errorCode: "COLLECT_TIMEOUT",
      errorMessage: `Collect timed out after ${attemptCount} attempts. Still pending: ${pendingIds}`,
    });

    return {
      outcome: "collection_failed",
      adJobId,
      completedCount: completed.length,
      totalCount,
      failedRequiredSceneIds: [],
      errorCode: "COLLECT_TIMEOUT",
      errorMessage: `Collect timed out after ${attemptCount} attempts`,
    };
  }

  // ── 8. Still waiting
  if (pending.length > 0) {
    const progress = calcCollectingProgress(completed.length, totalCount);

    await supabaseAdmin
      .from("ad_sequence_jobs")
      .update({
        scene_job_refs: updatedRefs,
        progress,
        collect_attempt_count: attemptCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", adJobId);

    await enqueueSequenceStep(adJobId, "sequence_collect");

    return {
      outcome: "waiting",
      adJobId,
      completedCount: completed.length,
      totalCount,
      failedRequiredSceneIds: [],
    };
  }

  // ── 9. All done — build ordered scene bundle
  const encodeCheckResult = checkEncodeQuality(updatedRefs);
  if (!encodeCheckResult.ok) {
    await transitionSequenceStage(adJobId, "scene_collection_failed", {
      sceneJobRefs: updatedRefs,
      errorCode: encodeCheckResult.errorCode,
      errorMessage: encodeCheckResult.errorMessage,
    });

    return {
      outcome: "collection_failed",
      adJobId,
      completedCount: completed.length,
      totalCount,
      failedRequiredSceneIds: encodeCheckResult.failedSceneIds,
      errorCode: encodeCheckResult.errorCode,
      errorMessage: encodeCheckResult.errorMessage,
    };
  }

  const collectResult = buildCollectResult(updatedRefs, snapshot);

  // ── 10. Transition: scene_collecting → sequence_resolving → assembly_preparing
  //
  // sequence_resolving: cut plan 계산 단계 (v0.1 = pass-through)
  // TODO: sequence_resolving 전용 로직 추가 시 enqueueSequenceStep("sequence_resolve") 분리
  await transitionSequenceStage(adJobId, "sequence_resolving", {
    sceneJobRefs: updatedRefs,
  });

  // assembly_preparing 전환 시 collectResult를 cut_plan에 임시 저장
  // TODO: collect_result 전용 컬럼 추가 후 collectResult 필드로 이전
  await transitionSequenceStage(adJobId, "assembly_preparing", {
    collectResult,
  });

  await enqueueSequenceStep(adJobId, "sequence_assemble");

  return {
    outcome: "ready",
    adJobId,
    completedCount: completed.length,
    totalCount,
    failedRequiredSceneIds: [],
    collectResult,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** scene_render_jobs를 일괄 조회. id → row 맵 반환. */
async function fetchSceneJobStatuses(
  sceneJobIds: string[]
): Promise<Map<string, { status: string; output_metadata: unknown; error_message: string | null }>> {
  if (sceneJobIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("scene_render_jobs")
    .select("id, status, output_metadata, error_message")
    .in("id", sceneJobIds);

  if (error) {
    throw new Error(`sequence-collect: failed to fetch scene jobs: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return [
        row.id as string,
        {
          status: row.status as string,
          output_metadata: row.output_metadata ?? null,
          error_message: (row.error_message as string) ?? null,
        },
      ];
    })
  );
}

/**
 * job_snapshot의 AdSceneSpec에서 해당 sceneId의 optional 여부 조회.
 * 없으면 false (required로 처리).
 */
function isOptionalScene(snapshot: AdSequenceJobSnapshot, sceneId: string): boolean {
  return snapshot?.scenes?.find((s) => s.sceneId === sceneId)?.optional ?? false;
}

/**
 * 완료된 required 씬들의 scene_encode stageResult 검사.
 * passed=false 인 required 씬이 있으면 에러 반환.
 */
function checkEncodeQuality(refs: SceneJobRef[]): {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  failedSceneIds: string[];
} {
  const failed: string[] = [];

  for (const ref of refs) {
    if (ref.status !== "completed") continue;
    if (!ref.outputMetadata) {
      return {
        ok: false,
        errorCode: "SCENE_OUTPUT_MISSING",
        errorMessage: `Scene ${ref.sceneId} has status=completed but outputMetadata is missing`,
        failedSceneIds: [ref.sceneId],
      };
    }

    const encodeResult = ref.outputMetadata.stageResults?.["scene_encode"];
    if (encodeResult && !encodeResult.passed) {
      failed.push(ref.sceneId);
    }
  }

  if (failed.length > 0) {
    return {
      ok: false,
      errorCode: "ENCODE_QUALITY_FAILED",
      errorMessage: `scene_encode quality check failed for scene(s): ${failed.join(", ")}`,
      failedSceneIds: failed,
    };
  }

  return { ok: true, failedSceneIds: [] };
}

/** 완료된 씬 refs로 SequenceCollectResult 빌드. */
function buildCollectResult(
  refs: SceneJobRef[],
  snapshot: AdSequenceJobSnapshot
): SequenceCollectResult {
  const sceneOptionalMap = new Map(
    (snapshot?.scenes ?? []).map((s) => [s.sceneId, s.optional])
  );

  const completedRefs = refs
    .filter((r) => r.status === "completed" && r.outputMetadata)
    .sort((a, b) => a.order - b.order);

  const skippedCount = refs.filter((r) => r.status === "skipped").length;
  const requiredCount = refs.filter((r) => !sceneOptionalMap.get(r.sceneId)).length;

  const orderedScenes: CollectSceneEntry[] = completedRefs.map((ref) => {
    const meta = ref.outputMetadata!;
    const encodeResult = meta.stageResults?.["scene_encode"];
    return {
      sceneId: ref.sceneId,
      sceneJobId: ref.sceneJobId!,
      order: ref.order,
      category: ref.category,
      templateCode: ref.templateCode,
      optional: sceneOptionalMap.get(ref.sceneId) ?? false,
      finalSceneUrl: meta.assets.finalSceneUrl,
      thumbnailUrl: meta.assets.thumbnailUrl,
      previewClipUrl: meta.assets.previewClipUrl ?? null,
      durationSec: meta.durationSec,
      fps: meta.fps,
      width: meta.width,
      height: meta.height,
      shotType: meta.shotType,
      safeCutFrames: meta.safeCutFrames ?? null,
      appliedCopy: meta.appliedCopy,
      appliedProductZones: meta.appliedProductZones,
      encodeQuality: {
        passed: encodeResult?.passed ?? true,
        score: encodeResult?.score ?? null,
      },
    };
  });

  return {
    type: "scene_bundle",
    collectedAt: new Date().toISOString(),
    totalScenes: refs.length,
    requiredSceneCount: requiredCount,
    completedCount: completedRefs.length,
    skippedCount,
    readyForAssembly: true,
    orderedScenes,
  };
}
