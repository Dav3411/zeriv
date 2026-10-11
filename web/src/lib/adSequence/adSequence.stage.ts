/**
 * adSequence.stage.ts — Sequence orchestrator state machine.
 *
 * ─── 상태 전이 규칙 ─────────────────────────────────────────────────────────
 *
 * [Preparation]
 *   sequence_queued
 *     entry:  DB insert 직후
 *     exit:   sequence-worker가 sequence_validate 호출
 *
 *   sequence_validating
 *     entry:  /api/internal/sequence-validate 진입
 *     exit:   validation 통과 → scene_jobs_creating
 *     fail:   sequence_validation_failed (non-retryable)
 *
 *   scene_jobs_creating
 *     entry:  validation 통과 직후
 *     exit:   모든 sceneRenderJob 생성 완료 → scene_collecting
 *     fail:   assembly_failed (DB/network 에러)
 *
 * [Collecting]
 *   scene_collecting
 *     entry:  scene jobs 생성 완료
 *     exit:   모든 required scene completed (or skipped if optional)
 *             → sequence_resolving
 *     fail:   1개 이상의 required scene failed → scene_collection_failed
 *     trigger: 각 scene의 scene_encode 완료 시 sequence-worker/sequence_collect 호출
 *
 * [Resolving]
 *   sequence_resolving
 *     entry:  모든 scene 수집 완료
 *     exit:   cut plan 계산 완료 → assembly_preparing
 *     특성:   transition compatibility 경고 기록 (hard_fail은 이미 validator에서 막음)
 *     fail:   cut plan 계산 실패 → assembly_failed
 *
 * [Assembly]
 *   assembly_preparing
 *     entry:  cut plan 저장 완료
 *     exit:   FFmpeg 입력 파일 R2 다운로드 완료 → assembly_rendering
 *
 *   assembly_rendering
 *     entry:  입력 파일 준비 완료
 *     exit:   FFmpeg concat 완료 → assembly_encoding
 *     retry:  최대 2회 (network/FFmpeg 에러)
 *
 *   assembly_encoding
 *     entry:  concat 완료
 *     exit:   최종 인코딩 + 썸네일 + metadata R2 저장 완료 → assembly_completed
 *     retry:  최대 2회
 *
 * ─── Retry policy ────────────────────────────────────────────────────────────
 *   sequence_validate:   0회 (validation 실패는 입력 문제)
 *   scene_jobs_create:   2회 (DB/network 에러)
 *   sequence_collect:    0회 (scene render 완료 대기 — 실패는 scene_collection_failed)
 *   sequence_assemble:   2회 (assembly_rendering + assembly_encoding 포함)
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdSequenceStage, AdSequenceStatus } from "./adSequence.types";

// ─── Stage → Status ───────────────────────────────────────────────────────────

export const SEQUENCE_STAGE_TO_STATUS: Record<AdSequenceStage, AdSequenceStatus> = {
  sequence_queued:            "queued",
  sequence_validating:        "validating",
  sequence_validation_failed: "failed",
  scene_jobs_creating:        "rendering",
  scene_collecting:           "rendering",
  scene_collection_failed:    "failed",
  sequence_resolving:         "rendering",
  assembly_preparing:         "assembling",
  assembly_rendering:         "assembling",
  assembly_encoding:          "assembling",
  assembly_completed:         "completed",
  assembly_failed:            "failed",
};

// ─── Stage → Progress (%) ────────────────────────────────────────────────────

export const SEQUENCE_STAGE_PROGRESS: Record<AdSequenceStage, number> = {
  sequence_queued:            2,
  sequence_validating:        5,
  sequence_validation_failed: 0,
  scene_jobs_creating:        8,
  /**
   * scene_collecting은 progress를 고정하지 않고
   * 완료된 scene 수 / 전체 scene 수로 10–82% 사이에서 동적으로 계산한다.
   * 이 값은 fallback용.
   */
  scene_collecting:           10,
  scene_collection_failed:    0,
  sequence_resolving:         83,
  assembly_preparing:         86,
  assembly_rendering:         91,
  assembly_encoding:          96,
  assembly_completed:         100,
  assembly_failed:            0,
};

/**
 * scene_collecting 진행 중 progress를 동적으로 계산.
 * 완료 비율을 10–82% 범위에 매핑.
 */
export function calcCollectingProgress(completedCount: number, totalCount: number): number {
  if (totalCount === 0) return 10;
  const ratio = completedCount / totalCount;
  return Math.round(10 + ratio * 72); // 10% ~ 82%
}

// ─── Terminal stages ──────────────────────────────────────────────────────────

export const TERMINAL_SEQUENCE_STAGES = new Set<AdSequenceStage>([
  "sequence_validation_failed",
  "scene_collection_failed",
  "assembly_completed",
  "assembly_failed",
]);

// ─── Retry policy ─────────────────────────────────────────────────────────────

export interface SequenceStepRetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
}

export const SEQUENCE_STEP_RETRY_POLICY: Record<string, SequenceStepRetryPolicy> = {
  sequence_validate:  { maxRetries: 0, baseDelayMs: 0 },
  scene_jobs_create:  { maxRetries: 2, baseDelayMs: 2_000 },
  sequence_collect:   { maxRetries: 0, baseDelayMs: 0 },  // scene render 완료 대기
  sequence_assemble:  { maxRetries: 2, baseDelayMs: 5_000 },
};

// ─── DB transition ────────────────────────────────────────────────────────────

interface TransitionOptions {
  errorCode?: string;
  errorMessage?: string;
  /** scene_collecting 진행 중 동적 progress 덮어쓰기 */
  overrideProgress?: number;
  /** cut plan 저장 */
  cutPlan?: unknown;
  /** scene_job_refs 업데이트 */
  sceneJobRefs?: unknown;
  /** output metadata 저장 (assembly_completed 시) */
  outputMetadata?: unknown;
  /** validation 결과 저장 (sequence_validating / scene_jobs_creating 시) */
  validationResult?: unknown;
  /**
   * sequence-collect 결과 (SequenceCollectResult).
   * assembly_preparing 전환 시 cut_plan 컬럼에 저장.
   * TODO: collect_result 전용 컬럼 마이그레이션 후 cutPlan과 분리.
   */
  collectResult?: unknown;
}

export async function transitionSequenceStage(
  adJobId: string,
  stage: AdSequenceStage,
  opts: TransitionOptions = {}
): Promise<void> {
  const status = SEQUENCE_STAGE_TO_STATUS[stage];
  const progress = opts.overrideProgress ?? SEQUENCE_STAGE_PROGRESS[stage];
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    current_stage: stage,
    status,
    progress,
    updated_at: now,
  };

  if (opts.errorCode)       patch.error_code = opts.errorCode;
  if (opts.errorMessage)    patch.error_message = opts.errorMessage;
  if (opts.cutPlan)         patch.cut_plan = opts.cutPlan;
  if (opts.sceneJobRefs)    patch.scene_job_refs = opts.sceneJobRefs;
  if (opts.outputMetadata) {
    patch.output_metadata = opts.outputMetadata;
    // Promote finalAdVideoUrl to top-level column for easy querying
    const meta = opts.outputMetadata as Record<string, unknown>;
    if (meta.finalAdVideoUrl) patch.final_ad_url = meta.finalAdVideoUrl;
  }
  if (opts.validationResult) patch.validation_result = opts.validationResult;
  // collectResult는 cut_plan 컬럼에 저장 (proto-cut-plan으로 재활용)
  // TODO: collect_result 전용 JSONB 컬럼 추가 후 patch.collect_result = ... 으로 이전
  if (opts.collectResult) patch.cut_plan = opts.collectResult;
  if (status === "completed") patch.completed_at = now;

  const { error } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .update(patch)
    .eq("id", adJobId);

  if (error) {
    console.error(
      JSON.stringify({
        action: "transitionSequenceStage_failed",
        adJobId,
        stage,
        error: error.message,
      })
    );
  }
}
