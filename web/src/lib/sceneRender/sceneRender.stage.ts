/**
 * sceneRender.stage.ts — Scene render 상태 머신.
 *
 * - STAGE_TO_STATUS: 내부 stage → 사용자 노출 status 매핑
 * - STAGE_PROGRESS: 내부 stage → progress % 매핑
 * - STAGE_TO_NEXT_STEP: 스텝 완료 시 다음 큐 스텝 결정
 * - transitionSceneStage: DB 업데이트 헬퍼
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SceneRenderStage, SceneRenderStatus, SceneRenderQueueStep } from "./sceneRender.types";

// ─── Stage → Status ───────────────────────────────────────────────────────────

export const STAGE_TO_STATUS: Record<SceneRenderStage, SceneRenderStatus> = {
  // Preparation
  scene_queued:             "queued",
  scene_preparing:          "preparing",
  scene_snapshot_ready:     "preparing",
  scene_asset_loading:      "preparing",
  scene_asset_ready:        "preparing",
  scene_background_ready:   "preparing",
  // Body
  scene_body_waiting:       "rendering",
  scene_body_rendering:     "rendering",
  scene_body_validating:    "rendering",
  scene_body_completed:     "rendering",
  scene_body_failed:        "failed",
  // Face
  scene_face_waiting:       "rendering",
  scene_face_rendering:     "rendering",
  scene_face_validating:    "rendering",
  scene_face_completed:     "rendering",
  scene_face_failed:        "failed",
  // Fusion
  scene_fusion_waiting:     "rendering",
  scene_fusion_running:     "rendering",
  scene_fusion_validating:  "rendering",
  scene_fusion_completed:   "rendering",
  scene_fusion_failed:      "failed",
  // Matting
  scene_matting_waiting:    "rendering",
  scene_matting_running:    "rendering",
  scene_matting_validating: "rendering",
  scene_matting_completed:  "rendering",
  scene_matting_failed:     "failed",
  scene_character_ready:    "rendering",
  // Composition
  scene_composition_waiting:    "rendering",
  scene_composition_running:    "rendering",
  scene_composition_validating: "rendering",
  scene_composition_completed:  "rendering",
  scene_composition_failed:     "failed",
  // Text overlay (ad-specific)
  scene_text_overlay_waiting:    "compositing",
  scene_text_overlay_running:    "compositing",
  scene_text_overlay_completed:  "compositing",
  scene_text_overlay_failed:     "failed",
  // Product composite (ad-specific)
  scene_product_composite_waiting:    "compositing",
  scene_product_composite_running:    "compositing",
  scene_product_composite_completed:  "compositing",
  scene_product_composite_failed:     "failed",
  // Ending compose (static_hybrid ending 전용)
  scene_ending_compose_waiting:    "compositing",
  scene_ending_compose_running:    "compositing",
  scene_ending_compose_completed:  "compositing",
  scene_ending_compose_failed:     "failed",
  // Polish
  scene_polish_waiting:    "finalizing",
  scene_polish_running:    "finalizing",
  scene_polish_completed:  "finalizing",
  scene_polish_failed:     "failed",
  // Encoding
  scene_encoding_waiting:    "finalizing",
  scene_encoding_running:    "finalizing",
  scene_encoding_finalizing: "finalizing",
  scene_encoding_failed:     "failed",
  // Terminal
  scene_completed: "completed",
  scene_failed:    "failed",
};

// ─── Stage → Progress (%) ──────────────────────────────────────────────────────

export const STAGE_PROGRESS: Record<SceneRenderStage, number> = {
  scene_queued:             3,
  scene_preparing:          6,
  scene_snapshot_ready:     10,
  scene_asset_loading:      13,
  scene_asset_ready:        15,
  scene_background_ready:   16,
  // Body
  scene_body_waiting:       18,
  scene_body_rendering:     25,
  scene_body_validating:    30,
  scene_body_completed:     35,
  scene_body_failed:        0,
  // Face
  scene_face_waiting:       36,
  scene_face_rendering:     40,
  scene_face_validating:    43,
  scene_face_completed:     45,
  scene_face_failed:        0,
  // Fusion
  scene_fusion_waiting:     46,
  scene_fusion_running:     50,
  scene_fusion_validating:  53,
  scene_fusion_completed:   55,
  scene_fusion_failed:      0,
  // Matting
  scene_matting_waiting:    56,
  scene_matting_running:    60,
  scene_matting_validating: 63,
  scene_matting_completed:  65,
  scene_matting_failed:     0,
  scene_character_ready:    66,
  // Composition
  scene_composition_waiting:    66,
  scene_composition_running:    70,
  scene_composition_validating: 73,
  scene_composition_completed:  75,
  scene_composition_failed:     0,
  // Text overlay
  scene_text_overlay_waiting:    76,
  scene_text_overlay_running:    80,
  scene_text_overlay_completed:  83,
  scene_text_overlay_failed:     0,
  // Product composite
  scene_product_composite_waiting:    84,
  scene_product_composite_running:    87,
  scene_product_composite_completed:  89,
  scene_product_composite_failed:     0,
  // Ending compose (static_hybrid ending 전용 — text+product 대체)
  scene_ending_compose_waiting:    76,
  scene_ending_compose_running:    84,
  scene_ending_compose_completed:  89,
  scene_ending_compose_failed:     0,
  // Polish
  scene_polish_waiting:    90,
  scene_polish_running:    93,
  scene_polish_completed:  95,
  scene_polish_failed:     0,
  // Encoding
  scene_encoding_waiting:    96,
  scene_encoding_running:    98,
  scene_encoding_finalizing: 99,
  scene_encoding_failed:     0,
  // Terminal
  scene_completed: 100,
  scene_failed:    0,
};

// ─── Stage → next queue step ──────────────────────────────────────────────────

/**
 * 각 스텝 완료 후 다음 큐 스텝을 반환.
 * null = 파이프라인 종료 (scene_encode 이후).
 *
 * text_slot이 없는 템플릿은 scene_text_overlay를 건너뛰어야 하지만,
 * 그 판단은 orchestrator에서 한다 (여기서는 기본 경로만 정의).
 */
/** 일반 씬 스텝 순서 (text/product 선택적 skip) */
export const STEP_SEQUENCE: SceneRenderQueueStep[] = [
  "scene_prepare",
  "scene_body_pass",
  "scene_face_pass",
  "scene_fusion",
  "scene_matting",
  "scene_composition",
  "scene_text_overlay",       // text_slots 없으면 skip 가능
  "scene_product_composite",  // product_zones 없으면 skip 가능
  "scene_polish",
  "scene_encode",
];

/** ending 씬 스텝 순서 (text/product 대신 ending_compose 단일 스텝) */
export const ENDING_STEP_SEQUENCE: SceneRenderQueueStep[] = [
  "scene_prepare",
  "scene_body_pass",
  "scene_face_pass",
  "scene_fusion",
  "scene_matting",
  "scene_composition",
  "scene_ending_compose",     // static_hybrid+ending: text+product 레이아웃을 한 번에 조립
  "scene_polish",
  "scene_encode",
];

export interface GetNextStepOpts {
  hasTextSlots: boolean;
  hasProductZones: boolean;
  /** category=ending && shotType=static_hybrid 씬 여부 */
  isEndingScene?: boolean;
}

export function getNextStep(
  currentStep: SceneRenderQueueStep,
  opts: GetNextStepOpts
): SceneRenderQueueStep | null {
  const sequence = opts.isEndingScene ? ENDING_STEP_SEQUENCE : STEP_SEQUENCE;
  const idx = sequence.indexOf(currentStep);
  if (idx === -1 || idx === sequence.length - 1) return null;

  let next = sequence[idx + 1];

  if (!opts.isEndingScene) {
    // Skip text_overlay if no text slots
    if (next === "scene_text_overlay" && !opts.hasTextSlots) {
      next = sequence[idx + 2];
    }
    // Skip product_composite if no product zones
    if (next === "scene_product_composite" && !opts.hasProductZones) {
      next = sequence[sequence.indexOf("scene_product_composite") + 1];
    }
  }

  return next ?? null;
}

// ─── DB transition ─────────────────────────────────────────────────────────────

interface TransitionOptions {
  errorCode?: string;
  errorMessage?: string;
}

export async function transitionSceneStage(
  sceneJobId: string,
  stage: SceneRenderStage,
  opts: TransitionOptions = {}
): Promise<void> {
  const status = STAGE_TO_STATUS[stage];
  const progress = STAGE_PROGRESS[stage];
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    current_stage: stage,
    status,
    progress,
    updated_at: now,
  };

  if (opts.errorCode) patch.error_code = opts.errorCode;
  if (opts.errorMessage) patch.error_message = opts.errorMessage;
  if (status === "completed") patch.completed_at = now;
  if (stage === "scene_body_rendering") patch.started_at = now;

  const { error } = await supabaseAdmin
    .from("scene_render_jobs")
    .update(patch)
    .eq("id", sceneJobId);

  if (error) {
    console.error(
      JSON.stringify({
        action: "transitionSceneStage_failed",
        sceneJobId,
        stage,
        error: error.message,
      })
    );
  }
}
