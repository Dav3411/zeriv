/**
 * sceneCompose/sceneCompose.types.ts — Ad composition 집계 요청/응답 타입.
 *
 * 3개 서브시스템을 하나로 묶는 진입점:
 *   - product: ProductInsertionSpec
 *   - text: TextRenderSpec[]
 *   - ending: EndingCompositionProfile (ending 씬 전용)
 */

import type { ProductInsertionSpec, ProductInsertionResult } from "./product/product.types";
import type { TextRenderSpec, TextRenderResult } from "./text/text.types";
import type { EndingCompositionProfile, EndingCompositionResult } from "./ending/ending.types";

// ─── Compose request ──────────────────────────────────────────────────────────

/**
 * 일반 씬 (text_overlay + product_composite) 합성 요청.
 */
export interface SceneComposeRequest {
  sceneJobId: string;
  /** 입력 이미지 R2 key (draft_composite 결과) */
  inputImageKey: string;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  /** null = 제품 합성 없음 */
  productSpec: ProductInsertionSpec | null;
  /** 빈 배열 = 텍스트 합성 없음 */
  textSpecs: TextRenderSpec[];
}

/**
 * ending 씬 전용 합성 요청 (scene_ending_compose 스텝).
 */
export interface EndingComposeRequest {
  sceneJobId: string;
  /** 입력 이미지 R2 key (scene_composition 결과) */
  inputImageKey: string;
  profile: EndingCompositionProfile;
}

// ─── Compose result ───────────────────────────────────────────────────────────

export interface SceneComposeResult {
  /** 텍스트+제품 합성이 모두 완료된 최종 이미지 R2 key */
  outputKey: string;
  productResult: ProductInsertionResult | null;
  textResult: TextRenderResult | null;
  totalDurationMs: number;
}

export interface EndingComposeResult {
  outputKey: string;
  endingResult: EndingCompositionResult;
  totalDurationMs: number;
}

// ─── Step worker request / response ──────────────────────────────────────────

/**
 * /api/internal/scene-text-overlay 에 전달되는 페이로드.
 */
export interface SceneTextOverlayWorkerRequest {
  scene_job_id: string;
}

/**
 * /api/internal/scene-product-composite 에 전달되는 페이로드.
 */
export interface SceneProductCompositeWorkerRequest {
  scene_job_id: string;
}

/**
 * /api/internal/scene-ending-compose 에 전달되는 페이로드.
 */
export interface SceneEndingComposeWorkerRequest {
  scene_job_id: string;
}

export interface SceneComposeWorkerResponse {
  ok: boolean;
  outputKey?: string;
  error?: string;
}
