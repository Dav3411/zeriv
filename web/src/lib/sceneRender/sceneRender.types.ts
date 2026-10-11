/**
 * sceneRender.types.ts — Scene render job 응답/스냅샷/메타데이터 타입.
 *
 * 이 파일은 런타임에 DB row → API response 변환과
 * frozen snapshot (job 생성 시점 상태 고정) 구조를 정의한다.
 */

import type {
  SceneCharacterInput,
  SceneBackgroundInput,
  SceneCopyInput,
  SceneProductInput,
  SceneOutputOptions,
} from "./sceneRender.schema";
import type { AdTemplateSnapshot } from "@/lib/adTemplate/adTemplate.types";

// ─── Stage result (스텝별 결과 기록) ────────────────────────────────────────

/**
 * 각 큐 스텝이 완료될 때 stageResults에 기록하는 단위 구조체.
 *
 * score:      0–1 품질 점수 (없으면 null — 품질 측정이 없는 스텝)
 * passed:     해당 스텝의 품질 기준 충족 여부
 * reportUrl:  R2에 저장된 상세 리포트 JSON URL (없으면 null)
 * outputUrl:  해당 스텝의 주요 산출물 URL (없으면 null)
 * durationMs: 스텝 실행 소요 시간
 * completedAt: 완료 시각 (ISO 8601)
 * retryCount: 재시도 횟수 (0 = 첫 시도에 성공)
 * meta:       스텝별 추가 데이터 (자유 형식 — step4/5에서 활용)
 */
export interface SceneStageResult {
  score: number | null;
  passed: boolean;
  reportUrl: string | null;
  outputUrl: string | null;
  durationMs: number;
  completedAt: string;
  retryCount: number;
  meta: Record<string, unknown>;
}

// ─── Queue step ───────────────────────────────────────────────────────────────

/** scene-worker edge function이 라우팅하는 큐 스텝 */
export type SceneRenderQueueStep =
  | "scene_prepare"            // 스냅샷 고정 + 에셋 검증
  | "scene_body_pass"          // body rendering (기존 workers/body 재사용)
  | "scene_face_pass"          // face rendering (기존 workers/face 재사용)
  | "scene_fusion"             // face-body fusion (기존 workers/fusion 재사용)
  | "scene_matting"            // foreground extraction (기존 workers/matting 재사용)
  | "scene_composition"        // FG+BG 합성 (기존 workers/composition 재사용)
  | "scene_text_overlay"       // text_slot 텍스트 합성 (신규, 일반 씬)
  | "scene_product_composite"  // product_zone 제품 이미지 합성 (신규, 일반 씬)
  | "scene_ending_compose"     // ending 전용 그래픽 레이아웃 조립 (신규, static_hybrid 엔딩)
  | "scene_polish"             // 최종 polish (기존 workers/polish 재사용)
  | "scene_encode";            // 최종 인코딩 (기존 workers/encoding 재사용)

// ─── Stage (세분화된 내부 상태) ────────────────────────────────────────────────

export type SceneRenderStage =
  // ── Preparation
  | "scene_queued"
  | "scene_preparing"
  | "scene_snapshot_ready"
  | "scene_asset_loading"
  | "scene_asset_ready"
  | "scene_background_ready"    // 배경 에셋 로드/선택 완료 체크포인트
  // ── Body
  | "scene_body_waiting"
  | "scene_body_rendering"
  | "scene_body_validating"
  | "scene_body_completed"
  | "scene_body_failed"
  // ── Face
  | "scene_face_waiting"
  | "scene_face_rendering"
  | "scene_face_validating"
  | "scene_face_completed"
  | "scene_face_failed"
  // ── Fusion
  | "scene_fusion_waiting"
  | "scene_fusion_running"
  | "scene_fusion_validating"
  | "scene_fusion_completed"
  | "scene_fusion_failed"
  // ── Matting
  | "scene_matting_waiting"
  | "scene_matting_running"
  | "scene_matting_validating"
  | "scene_matting_completed"
  | "scene_matting_failed"
  | "scene_character_ready"     // 캐릭터 렌더링 완료 체크포인트 (matting 이후)
  // ── Composition
  | "scene_composition_waiting"
  | "scene_composition_running"
  | "scene_composition_validating"
  | "scene_composition_completed"
  | "scene_composition_failed"
  // ── Text overlay (ad-specific)
  | "scene_text_overlay_waiting"
  | "scene_text_overlay_running"
  | "scene_text_overlay_completed"
  | "scene_text_overlay_failed"
  // ── Product composite (ad-specific)
  | "scene_product_composite_waiting"
  | "scene_product_composite_running"
  | "scene_product_composite_completed"
  | "scene_product_composite_failed"
  // ── Ending compose (static_hybrid ending 전용)
  | "scene_ending_compose_waiting"
  | "scene_ending_compose_running"
  | "scene_ending_compose_completed"
  | "scene_ending_compose_failed"
  // ── Polish
  | "scene_polish_waiting"
  | "scene_polish_running"
  | "scene_polish_completed"
  | "scene_polish_failed"
  // ── Encoding
  | "scene_encoding_waiting"
  | "scene_encoding_running"
  | "scene_encoding_finalizing"
  | "scene_encoding_failed"
  // ── Terminal
  | "scene_completed"
  | "scene_failed";

// ─── Status (사용자 노출 상태) ─────────────────────────────────────────────────

export type SceneRenderStatus =
  | "queued"
  | "preparing"
  | "rendering"      // body → face → fusion → matting → composition
  | "compositing"    // text_overlay + product_composite
  | "finalizing"     // polish + encoding
  | "completed"
  | "failed";

// ─── Frozen snapshot ──────────────────────────────────────────────────────────

/**
 * JobSnapshot: job 생성 시점에 모든 입력을 고정(freeze)한 구조체.
 * DB의 job_snapshot JSONB 컬럼에 통째로 저장된다.
 * 이후 각 스텝이 이 snapshot에서 필요한 정보를 읽는다.
 */
export interface SceneJobSnapshot {
  /** 템플릿 전체 정보 (asset URL 포함) */
  templateSnapshot: AdTemplateSnapshot;
  /** 캐릭터 원본 입력 */
  characterInput: SceneCharacterInput;
  /** 배경 원본 입력 */
  backgroundInput: SceneBackgroundInput;
  /** slotId → 최종 텍스트 (required 검증 + maxChars 자름 적용 후) */
  resolvedCopy: Record<string, string>;
  /** zoneId → product 입력 */
  resolvedProduct: SceneProductInput;
  /** 출력 옵션 (해상도/fps/썸네일 여부) */
  outputOptions: Required<SceneOutputOptions>;
  /** snapshot 생성 시각 */
  frozenAt: string;
}

// ─── Intermediate asset URLs ──────────────────────────────────────────────────

export interface SceneAssetUrls {
  // Body / Face / Fusion
  bodyPassUrl: string | null;
  facePassUrl: string | null;
  fusedCharacterUrl: string | null;
  // Matting
  foregroundAlphaUrl: string | null;
  // Composition
  draftCompositeUrl: string | null;
  // Ad-specific overlays
  textOverlayUrl: string | null;       // text_slot이 합성된 중간 산출물
  productCompositeUrl: string | null;  // product_zone이 합성된 중간 산출물
  // Polish + Encoding
  polishedMasterUrl: string | null;
  // Final
  finalSceneUrl: string | null;
  thumbnailUrl: string | null;
  previewClipUrl: string | null;
  sceneMetadataUrl: string | null;
}

// ─── Scene metadata sub-summaries ────────────────────────────────────────────

/**
 * product_composite 스텝 완료 후 기록되는 배치 요약.
 * mode=none 이면 null.
 */
export interface ScenePlacementSummary {
  mode: string;                      // InsertionMode
  requestedMode: string;
  zoneId: string;
  actualX: number;
  actualY: number;
  actualWidth: number;
  actualHeight: number;
  aspectRatioUsed: number;
  backgroundRemovedByWorker: boolean;
  dropShadowApplied: boolean;
  wasClampedToSafeArea: boolean;
}

/**
 * text_overlay 스텝 완료 후 기록되는 슬롯별 처리 요약.
 * text_slots가 없는 씬이면 null.
 */
export interface SceneTextRenderSummary {
  renderedSlotCount: number;
  slotResults: Array<{
    slotId: string;
    kind: string;                    // TextSlotKind
    finalCharCount: number;
    lineCount: number;
    finalFontSizeVh: number;
    wasTruncated: boolean;
    wasScaled: boolean;
    overflowPolicy: string;          // OverflowPolicy
  }>;
}

/**
 * ending_compose 스텝 완료 후 기록되는 조립 요약.
 * ending 씬이 아니면 null.
 */
export interface SceneEndingCompositionSummary {
  layoutMode: string;                // EndingLayoutMode
  requiresCharacterLayer: boolean;
  renderedElementKinds: string[];    // EndingElementKind[]
}

// ─── Output scene metadata ────────────────────────────────────────────────────

/**
 * 최종 scene 산출물의 메타데이터 (R2에 JSON으로 저장).
 * 이후 광고 조립 단계에서 씬 카탈로그로 사용된다.
 */
export interface SceneOutputMetadata {
  sceneJobId: string;
  templateId: string;
  templateCode: string;
  templateVersion: number;
  category: string;      // hook | product_show | ...
  shotType: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;

  // ── Assets
  assets: {
    finalSceneUrl: string;
    thumbnailUrl: string;
    previewClipUrl: string | null;
  };

  // ── Safe cut range
  /**
   * 편집 안전 트림 범위 (초 단위).
   * 광고 조립 단계에서 씬을 이어붙일 때 이 범위 안에서 컷 포인트를 결정한다.
   * null = 씬 전체가 안전 구간 (or 미계산).
   */
  safeCutFrames: {
    startFrame: number;  // 이 프레임 이전을 잘라도 안전
    endFrame: number;    // 이 프레임 이후를 잘라도 안전
  } | null;

  // ── Applied inputs
  /** 실제 렌더에 사용된 텍스트 슬롯 값 */
  appliedCopy: Record<string, string>;
  /** 실제 렌더에 사용된 제품 이미지 URL (zoneId → imageUrl) */
  appliedProductZones: Record<string, string>;

  // ── Composition summaries
  /** product insertion 요약 (mode=none이면 null) */
  placementSummary: ScenePlacementSummary | null;
  /** text overlay 요약 (text_slots 없으면 null) */
  textRenderSummary: SceneTextRenderSummary | null;
  /** ending composition 요약 (ending 씬이 아니면 null) */
  endingCompositionSummary: SceneEndingCompositionSummary | null;

  // ── Stage results
  /**
   * 스텝별 렌더 결과.
   * 각 스텝이 완료될 때 해당 키에 결과를 기록한다.
   */
  stageResults: Partial<Record<SceneRenderQueueStep, SceneStageResult>>;

  // ── Quality + timing
  /** 전체 품질 통과 여부 (모든 core 스텝 passed 기준) */
  overallPassed: boolean;
  renderDurationMs: number;
  completedAt: string;
}

// ─── API response ─────────────────────────────────────────────────────────────

export interface SceneRenderJobResponse {
  sceneJobId: string;
  status: SceneRenderStatus;
  currentStage: SceneRenderStage;
  progress: number;
  templateId: string;
  templateCode: string;
  category: string;
  // Assets (null until each step completes)
  assets: SceneAssetUrls;
  // Output metadata (null until completed)
  outputMetadata: SceneOutputMetadata | null;
  // Error info
  errorCode: string | null;
  errorMessage: string | null;
  // Timing
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** snapshot만 요청 시 포함 */
  snapshot?: SceneJobSnapshot;
}

export interface CreateSceneRenderJobResponse {
  sceneJobId: string;
  status: "queued";
  currentStage: "scene_queued";
  templateCode: string;
  category: string;
  estimatedSteps: SceneRenderQueueStep[];
}
