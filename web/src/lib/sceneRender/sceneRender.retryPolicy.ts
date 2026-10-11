/**
 * sceneRender.retryPolicy.ts
 *
 * Scene render 파이프라인의 스텝별 재시도 정책 + 상태 전이 entry/exit 조건.
 *
 * ─── State transition rules (요약) ──────────────────────────────────────────
 *
 * [Preparation]
 *   scene_queued
 *     entry:  job DB insert 직후
 *     exit:   scene-worker가 scene_prepare 호출
 *   scene_preparing → scene_snapshot_ready → scene_asset_loading
 *     → scene_background_ready → scene_asset_ready
 *     entry:  /api/internal/scene-prepare 진입
 *     exit:   에셋 HEAD check 완료 + 다음 스텝 enqueue
 *     fail:   scene_failed (non-retryable: character not found, constraint violated, assets missing)
 *
 * [Rendering — body/face/fusion/matting/composition]
 *   각 *_waiting → *_rendering/*_running → *_validating → *_completed
 *     entry:  해당 스텝 worker API 진입
 *     exit:   품질 점수 ≥ threshold (스텝별 상이) + 다음 스텝 enqueue
 *     fail:   *_failed → retryCount < maxRetries → 동일 스텝 재큐 (exponential backoff)
 *             retryCount ≥ maxRetries → scene_failed
 *
 *   scene_character_ready: scene_matting_completed 이후, scene_composition_waiting 이전
 *     entry:  matting 완료 확인
 *     exit:   즉시 scene_composition_waiting으로 전환 (별도 worker 호출 없음)
 *
 * [Compositing — text/product/ending]
 *   scene_text_overlay_*:
 *     skip:   template.text_slots.length === 0
 *   scene_product_composite_*:
 *     skip:   template.product_zones.length === 0 OR mode=none OR mode=ending_packshot
 *   scene_ending_compose_*:
 *     진입:   category=ending && shotType=static_hybrid
 *     skip:   위 조건 불충족
 *   fail:   retryableErrorCodes → 재시도, nonRetryableErrorCodes → scene_failed 즉시
 *
 * [Finalizing — polish/encoding]
 *   scene_polish_*:
 *     entry:  compositing 완료 (또는 skip 후) 직후
 *   scene_encoding_*:
 *     exit:   final video + thumbnail + metadata R2 저장 완료
 *             → DB output_metadata 기록 → status=completed
 *
 * ─── Non-retryable failures (즉시 scene_failed) ─────────────────────────────
 *   SCENE_CHARACTER_NOT_FOUND
 *   SCENE_CHARACTER_CONSTRAINT_VIOLATED
 *   SCENE_TEMPLATE_ASSETS_MISSING
 *   TEXT_SLOT_REQUIRED_MISSING
 *   ENDING_CHARACTER_LAYER_MISSING
 *   ENDING_REQUIRED_FIELDS_MISSING
 *   PRODUCT_ASSET_NOT_FOUND
 *   PRODUCT_UNSUPPORTED_MODE
 */

import type { SceneRenderQueueStep } from "./sceneRender.types";

// ─── Per-step retry policy ─────────────────────────────────────────────────────

export interface SceneStepRetryPolicy {
  maxRetries: number;
  /** 첫 재시도 대기 시간 (ms) — exponential backoff: delay × 2^retryCount */
  baseDelayMs: number;
}

export const SCENE_STEP_RETRY_POLICY: Record<SceneRenderQueueStep, SceneStepRetryPolicy> = {
  // Preparation — non-retryable at step level (failure codes decide)
  scene_prepare:           { maxRetries: 0, baseDelayMs: 0 },
  // Rendering — 3회 재시도, 점진적 백오프
  scene_body_pass:         { maxRetries: 3, baseDelayMs: 5_000 },
  scene_face_pass:         { maxRetries: 3, baseDelayMs: 5_000 },
  scene_fusion:            { maxRetries: 3, baseDelayMs: 3_000 },
  scene_matting:           { maxRetries: 3, baseDelayMs: 3_000 },
  scene_composition:       { maxRetries: 3, baseDelayMs: 3_000 },
  // Compositing — 2회 재시도
  scene_text_overlay:      { maxRetries: 2, baseDelayMs: 2_000 },
  scene_product_composite: { maxRetries: 2, baseDelayMs: 2_000 },
  scene_ending_compose:    { maxRetries: 2, baseDelayMs: 2_000 },
  // Finalizing — 2회 재시도
  scene_polish:            { maxRetries: 2, baseDelayMs: 3_000 },
  scene_encode:            { maxRetries: 2, baseDelayMs: 5_000 },
};

// ─── Step skip conditions ─────────────────────────────────────────────────────

/**
 * 스텝 skip 여부를 결정하는 조건.
 * getNextStep()의 분기 근거를 문서화.
 */
export interface SceneStepSkipCondition {
  /** true = 이 조건이 충족되면 스텝을 건너뜀 */
  skipWhen: string;
}

export const STEP_SKIP_CONDITIONS: Partial<Record<SceneRenderQueueStep, SceneStepSkipCondition>> = {
  scene_text_overlay: {
    skipWhen: "template.text_slots.length === 0",
  },
  scene_product_composite: {
    skipWhen:
      "template.product_zones.length === 0 OR resolvedProduct mode=none OR mode=ending_packshot",
  },
  scene_ending_compose: {
    skipWhen: "!(category=ending AND shotType=static_hybrid)",
  },
  // body/face/fusion/matting/composition:
  // static_hybrid ending 씬에서도 실행됨 (배경+캐릭터 합성은 공통)
};

// ─── v0.1 vs TODO ─────────────────────────────────────────────────────────────

/** v0.1에서 완전 구현해야 하는 스텝 */
export const V01_REQUIRED_STEPS: SceneRenderQueueStep[] = [
  "scene_prepare",
  "scene_body_pass",
  "scene_face_pass",
  "scene_fusion",
  "scene_matting",
  "scene_composition",
  "scene_text_overlay",
  "scene_product_composite",
  "scene_ending_compose",
  "scene_polish",
  "scene_encode",
];

/**
 * v0.1 product insertion 지원 모드.
 * side_packshot, handheld_supported는 v0.2.
 */
export const V01_SUPPORTED_INSERTION_MODES = ["none", "graphic_insert"] as const;

/**
 * v0.1 text slot kinds.
 * price_text, badge, countdown은 v0.2.
 */
export const V01_SUPPORTED_TEXT_KINDS = [
  "hook_text",
  "benefit_text",
  "cta_text",
  "disclaimer_text",
] as const;

/**
 * v0.1 ending layout modes.
 * packshot_offer_logo, disclaimer_included은 v0.2.
 */
export const V01_SUPPORTED_ENDING_MODES = [
  "character_packshot_logo",
  "cta_dominant",
  "logo_cta",
] as const;
