/**
 * sceneCompose/product/product.contract.ts
 *
 * Product insertion module의 실행 가능한 contract 정의.
 * /api/internal/scene-product-composite worker와의 경계를 고정한다.
 *
 * v0.1 구현 대상:  graphic_insert, none
 * v0.2 구현 예정:  side_packshot
 * TODO(미구현):    handheld_supported → graphic_insert 폴백 처리
 * 비적용:         ending_packshot    → scene_ending_compose 스텝에서 처리
 */

import type {
  InsertionMode,
  ProductInsertionSpec,
  ProductInsertionWarning,
} from "./product.types";

// ─── Supported / unsupported modes ───────────────────────────────────────────

/** v0.1에서 product_composite 스텝이 실제 처리하는 모드 */
export const SUPPORTED_INSERTION_MODES_V01: InsertionMode[] = [
  "none",
  "graphic_insert",
];

/** product_composite 스텝을 완전히 건너뛰는 모드 */
export const SKIP_COMPOSITE_MODES: InsertionMode[] = [
  "none",
  "ending_packshot", // ending_compose 스텝에서 처리
];

/** handheld_supported 요청 시 실제로 사용하는 폴백 모드 */
export const HANDHELD_FALLBACK_MODE: InsertionMode = "graphic_insert";

// ─── Worker payload ───────────────────────────────────────────────────────────

/**
 * /api/internal/scene-product-composite → worker로 전달되는 페이로드.
 * spec은 orchestrator가 완전히 resolved된 상태로 주입한다.
 */
export interface ProductCompositeWorkerPayload {
  sceneJobId: string;
  /** 합성 입력 이미지 R2 key
   *  text_slot이 있는 씬: text_overlay_url
   *  없는 씬: draft_composite_url
   */
  inputImageKey: string;
  spec: ProductInsertionSpec;
}

// ─── Placement result metadata ────────────────────────────────────────────────

/**
 * worker가 실제 배치 후 기록하는 결과 메타데이터.
 * SceneOutputMetadata.placementSummary에 저장된다.
 */
export interface PlacementResultMeta {
  mode: InsertionMode;
  /** handheld_supported → graphic_insert 폴백이 발생한 경우 원래 요청 모드 */
  requestedMode: InsertionMode;
  /** 실제 배치된 캔버스 좌표 + 크기 (픽셀) */
  actualX: number;
  actualY: number;
  actualWidth: number;
  actualHeight: number;
  /** 최종 사용된 aspect ratio */
  aspectRatioUsed: number;
  /** worker가 배경 제거를 실행했는지 */
  backgroundRemovedByWorker: boolean;
  /** 드롭섀도 적용 여부 */
  dropShadowApplied: boolean;
  /** safe area 경계를 벗어나 clamp 처리됐는지 */
  wasClampedToSafeArea: boolean;
}

// ─── Worker response ──────────────────────────────────────────────────────────

export interface ProductCompositeWorkerResponse {
  ok: boolean;
  outputImageKey?: string;
  placementMeta?: PlacementResultMeta;
  warnings?: ProductInsertionWarning[];
  durationMs?: number;
  error?: string;
  errorCode?: ProductInsertionErrorCode;
}

// ─── Error codes ──────────────────────────────────────────────────────────────

/**
 * ─── Degrade vs Hard fail 정책 ───────────────────────────────────────────────
 *
 * Degrade (경고만 기록, 합성 계속):
 *   - BG 제거(autoRemoveBackground) 실패 → 원본 이미지 그대로 사용
 *     warning: BG_REMOVAL_SKIPPED
 *   - aspect ratio probe 성공 → 계속
 *   - safe area overflow → clamp 후 계속
 *   - handheld_supported → graphic_insert 폴백 후 계속
 *
 * Hard fail (에러 코드 반환, step retry 또는 scene_failed):
 *   - PRODUCT_ASSET_NOT_FOUND: 재시도 없이 즉시 scene_failed
 *   - PRODUCT_UNSUPPORTED_MODE: 재시도 없이 즉시 scene_failed
 *   - PRODUCT_ASSET_DOWNLOAD_FAILED: 최대 2회 재시도
 *   - PRODUCT_COMPOSE_FAILED: 최대 2회 재시도
 */
export type ProductInsertionErrorCode =
  | "PRODUCT_ASSET_NOT_FOUND"           // 제품 이미지 R2 key/URL 404 (non-retryable)
  | "PRODUCT_ASSET_DOWNLOAD_FAILED"     // 다운로드 실패 (retryable)
  | "PRODUCT_ASPECT_RATIO_PROBE_FAILED" // probe 실패 → retry, 3회 후 scene_failed
  | "PRODUCT_UNSUPPORTED_MODE"          // 지원하지 않는 모드 (non-retryable)
  | "PRODUCT_COMPOSE_FAILED";           // PIL/캔버스 합성 실패 (retryable)

// ─── Retry policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxRetries: number;
  retryableErrorCodes: ProductInsertionErrorCode[];
  /** 즉시 job 실패 처리 (재시도 없음) */
  nonRetryableErrorCodes: ProductInsertionErrorCode[];
}

export const PRODUCT_INSERTION_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  retryableErrorCodes: [
    "PRODUCT_ASSET_DOWNLOAD_FAILED",
    "PRODUCT_ASPECT_RATIO_PROBE_FAILED",
    "PRODUCT_COMPOSE_FAILED",
  ],
  nonRetryableErrorCodes: [
    "PRODUCT_ASSET_NOT_FOUND",
    "PRODUCT_UNSUPPORTED_MODE",
  ],
};
