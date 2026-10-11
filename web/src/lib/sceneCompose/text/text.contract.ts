/**
 * sceneCompose/text/text.contract.ts
 *
 * Text rendering module의 실행 가능한 contract 정의.
 * /api/internal/scene-text-overlay worker와의 경계를 고정한다.
 *
 * v0.1 구현 대상:  hook_text, benefit_text, cta_text, disclaimer_text
 * v0.2 구현 예정:  price_text, badge, countdown
 * 애니메이션:      v0.2 (fadeInFrame/fadeOutFrame은 0으로 고정)
 */

import type {
  TextSlotKind,
  TextRenderSpec,
  TextRenderWarning,
  TypographyPreset,
  TextSafeArea,
  SafeAreaPosition,
  OverflowPolicy,
} from "./text.types";

// ─── Slot definition (template JSONB → resolver input) ───────────────────────

/**
 * 템플릿 JSONB의 text_slots[i] 구조.
 * orchestrator가 ad_templates.text_slots에서 파싱해 resolver에 전달.
 */
export interface TextSlotDefinition {
  slotId: string;
  kind: TextSlotKind;
  /** 최대 글자 수 (초과 시 truncate 또는 scale_down) */
  maxChars: number;
  /** 사용자 copy 입력이 없을 때 job을 실패시킬지 */
  required: boolean;
  /** 캔버스 비율 기반 safe area (0–1 relative to canvas size) */
  safeAreaDef: TextSafeAreaDefinition;
  /** 템플릿이 preset을 재정의하는 경우 */
  typographyOverride?: Partial<Pick<TypographyPreset,
    "fontFamily" | "fontWeight" | "fontSizeVh" | "color" | "maxLines">>;
  /** 애니메이션 프레임 범위 (없으면 전체 구간) */
  animation?: { fadeInFrame: number; fadeOutFrame: number };
}

/**
 * 캔버스 비율 기반 safe area 정의.
 * resolver가 절대 픽셀 좌표로 변환한다.
 */
export interface TextSafeAreaDefinition {
  position: SafeAreaPosition;
  /** 0–1, 캔버스 너비 대비 */
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  textAlign: "left" | "center" | "right";
  verticalAnchor: "top" | "middle" | "bottom";
}

// ─── Slot resolution rules ────────────────────────────────────────────────────

/**
 * 슬롯 해석 단계:
 *   1. resolvedCopy[slotId] 확인 → 없고 required=true → 에러
 *   2. 텍스트를 maxChars로 자름 (truncate) → wasTruncated 기록
 *   3. typography 결정:
 *      TYPOGRAPHY_PRESETS[kind] → typographyOverride로 부분 재정의
 *   4. safe area 절대 좌표 변환 (safeAreaDef × canvas 해상도)
 *   5. overflow 처리 계획 결정 (overflowPolicy from preset)
 *   6. TextRenderSpec 생성
 */
export interface TextSlotResolutionInput {
  slotDefinitions: TextSlotDefinition[];
  resolvedCopy: Record<string, string>;  // SceneJobSnapshot.resolvedCopy
  canvasWidth: number;
  canvasHeight: number;
}

// ─── Per-slot resolution result metadata ─────────────────────────────────────

/**
 * resolver가 각 슬롯에 대해 기록하는 처리 결과.
 * SceneOutputMetadata.textRenderSummary.slotResults에 저장.
 */
export interface TextSlotResolutionResult {
  slotId: string;
  kind: TextSlotKind;
  /** resolver가 최종 결정한 텍스트 (maxChars + maxLines 적용 후) */
  resolvedText: string;
  originalCharCount: number;
  finalCharCount: number;
  lineCount: number;
  /** 실제 렌더 시 사용된 fontSizeVh (scale_down이면 preset보다 작음) */
  finalFontSizeVh: number;
  /** overflowPolicy가 truncate이고 원본보다 짧아진 경우 */
  wasTruncated: boolean;
  /** overflowPolicy가 scale_down이고 폰트 크기가 줄어든 경우 */
  wasScaled: boolean;
  overflowPolicy: OverflowPolicy;
}

// ─── Worker payload ───────────────────────────────────────────────────────────

/**
 * /api/internal/scene-text-overlay → worker로 전달되는 페이로드.
 * textSpecs는 resolver가 완전히 resolved한 상태.
 */
export interface TextOverlayWorkerPayload {
  sceneJobId: string;
  /** 합성 입력 이미지 R2 key (draft_composite_url) */
  inputImageKey: string;
  textSpecs: TextRenderSpec[];
}

// ─── Worker response ──────────────────────────────────────────────────────────

export interface TextOverlayWorkerResponse {
  ok: boolean;
  outputImageKey?: string;
  slotResults?: TextSlotResolutionResult[];
  warnings?: TextRenderWarning[];
  durationMs?: number;
  error?: string;
  errorCode?: TextOverlayErrorCode;
}

/**
 * ─── Degrade vs Hard fail 정책 ───────────────────────────────────────────────
 *
 * Degrade (경고만 기록, 렌더 계속):
 *   - 텍스트가 maxChars를 초과 → overflowPolicy에 따라 처리
 *     truncate: 잘라서 "…" 추가 (warning: TEXT_TRUNCATED)
 *     scale_down: 폰트 크기를 줄여서 fit (warning: LINES_CAPPED 가능)
 *     allow_overflow: 그대로 렌더 (warning: OVERFLOW_CLIPPED)
 *     clip: 픽셀 마스크로 자름 (warning: OVERFLOW_CLIPPED)
 *   - FONT_FALLBACK: 폰트 없을 때 시스템 폰트로 대체 (warning: FONT_FALLBACK)
 *
 *   위 모두 TextRenderWarning으로 기록하고 렌더를 계속 진행한다.
 *   text overflow는 어떤 경우에도 hard fail이 아니다.
 *
 * Hard fail (에러 코드 반환):
 *   - TEXT_SLOT_REQUIRED_MISSING: required=true 슬롯 copy 없음 → 즉시 scene_failed
 *   - TEXT_FONT_NOT_FOUND: 폰트 파일 없음 → 2회 재시도 (이후 scene_failed)
 *   - TEXT_CANVAS_INIT_FAILED: 캔버스 초기화 실패 → 2회 재시도
 *   - TEXT_RENDER_FAILED: 렌더링 중 예외 → 2회 재시도
 */
export type TextOverlayErrorCode =
  | "TEXT_SLOT_REQUIRED_MISSING"  // required 슬롯 copy 없음 (non-retryable)
  | "TEXT_FONT_NOT_FOUND"         // 폰트 파일 없음 (retryable)
  | "TEXT_CANVAS_INIT_FAILED"     // 렌더링 캔버스 초기화 실패 (retryable)
  | "TEXT_RENDER_FAILED";         // 실제 텍스트 그리기 실패 (retryable)

// ─── Retry policy ─────────────────────────────────────────────────────────────

export const TEXT_OVERLAY_RETRY_POLICY = {
  maxRetries: 2,
  retryableErrorCodes: [
    "TEXT_FONT_NOT_FOUND",
    "TEXT_CANVAS_INIT_FAILED",
    "TEXT_RENDER_FAILED",
  ] as TextOverlayErrorCode[],
  nonRetryableErrorCodes: [
    "TEXT_SLOT_REQUIRED_MISSING",
  ] as TextOverlayErrorCode[],
} as const;
