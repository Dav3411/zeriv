/**
 * sceneCompose/product/product.types.ts — Product insertion 타입 정의.
 *
 * 지원 모드:
 *   none              — 제품 삽입 없음 (skip)
 *   graphic_insert    — 씬 하단 그래픽 영역에 제품 이미지 삽입
 *                       (드롭섀도 + 배경 제거 + 하단 고정 위치)
 *   side_packshot     — 좌/우 측면 팩샷 고정 위치
 *                       (캐릭터 옆 고정 앵커, 드롭섀도)
 *   ending_packshot   — ending_compose 전용 팩샷 (ending 스텝에서 처리)
 *                       (ending element로 변환, product_composite 스텝에서 skip)
 *   handheld_supported — 향후 구현 예정 (모델이 손에 제품을 쥔 것처럼 합성)
 *                        현재는 graphic_insert 폴백
 */

// ─── Insertion mode ───────────────────────────────────────────────────────────

export type InsertionMode =
  | "none"
  | "graphic_insert"
  | "side_packshot"
  | "ending_packshot"
  | "handheld_supported"; // TODO: 미구현 — graphic_insert로 폴백

// ─── Mode rules ───────────────────────────────────────────────────────────────

/**
 * 모드별 고정 행동 규칙.
 * orchestrator가 spec을 계산할 때 이 규칙을 기준으로 safe area와 크기를 결정.
 */
export interface InsertionModeRules {
  /**
   * 캔버스 내 기본 앵커 위치.
   * "bottom_center" | "bottom_left" | "bottom_right" | "side_left" | "side_right"
   */
  defaultAnchor: "bottom_center" | "bottom_left" | "bottom_right" | "side_left" | "side_right";
  /**
   * 제품 이미지의 최대 너비 (캔버스 너비 대비 %).
   * safe area 너비와 이 값 중 더 작은 쪽 적용.
   */
  maxWidthRatio: number;
  /**
   * 제품 이미지의 최대 높이 (캔버스 높이 대비 %).
   */
  maxHeightRatio: number;
  /** 드롭섀도 적용 여부 */
  applyDropShadow: boolean;
  /**
   * 배경 제거 자동 시도 여부.
   * hasTransparentBackground=true이면 무관.
   */
  autoRemoveBackground: boolean;
  /** safe area 경계 밖 overflow 허용 여부 */
  allowOverflow: boolean;
}

export const INSERTION_MODE_RULES: Record<InsertionMode, InsertionModeRules> = {
  none: {
    defaultAnchor: "bottom_center",
    maxWidthRatio: 0,
    maxHeightRatio: 0,
    applyDropShadow: false,
    autoRemoveBackground: false,
    allowOverflow: false,
  },
  graphic_insert: {
    defaultAnchor: "bottom_center",
    maxWidthRatio: 0.55,  // 캔버스 너비의 55% 이하
    maxHeightRatio: 0.35, // 캔버스 높이의 35% 이하
    applyDropShadow: true,
    autoRemoveBackground: true,
    allowOverflow: false,
  },
  side_packshot: {
    defaultAnchor: "side_right",  // 기본 오른쪽; 템플릿에서 재정의 가능
    maxWidthRatio: 0.35,
    maxHeightRatio: 0.45,
    applyDropShadow: true,
    autoRemoveBackground: true,
    allowOverflow: false,
  },
  ending_packshot: {
    // ending_compose 스텝에서 처리 — 이 규칙은 product_composite 스텝에서 skip됨
    defaultAnchor: "bottom_center",
    maxWidthRatio: 0.60,
    maxHeightRatio: 0.50,
    applyDropShadow: true,
    autoRemoveBackground: true,
    allowOverflow: false,
  },
  handheld_supported: {
    // TODO: graphic_insert 폴백
    defaultAnchor: "bottom_center",
    maxWidthRatio: 0.55,
    maxHeightRatio: 0.35,
    applyDropShadow: true,
    autoRemoveBackground: true,
    allowOverflow: false,
  },
};

// ─── Product asset spec ───────────────────────────────────────────────────────

/**
 * 합성에 사용될 제품 이미지 에셋 정보.
 * SceneJobSnapshot.resolvedProduct[zoneId]에서 파생.
 */
export interface ProductAssetSpec {
  zoneId: string;
  /** R2 key 또는 공개 URL */
  imageUrl: string;
  /** 실제 이미지 가로:세로 비율 (없으면 probe로 결정) */
  aspectRatio: number | null;
  /** PNG 투명 배경 여부 */
  hasTransparentBackground: boolean;
}

// ─── Safe area ────────────────────────────────────────────────────────────────

/**
 * 제품을 배치할 수 있는 안전 영역 (캔버스 픽셀 좌표).
 * 템플릿의 product_zone 정의에서 파생된다.
 */
export interface ProductSafeArea {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 요소가 safe area 경계를 벗어날 수 있는지 */
  allowOverflow: boolean;
}

// ─── Insertion spec ───────────────────────────────────────────────────────────

/**
 * product_composite 스텝이 실제 합성에 사용하는 완성된 스펙.
 * sceneCompose 서비스가 snapshot + template zone 정보 + mode rules를 조합해 생성.
 */
export interface ProductInsertionSpec {
  mode: InsertionMode;
  /** 모드별 규칙 (orchestrator가 INSERTION_MODE_RULES에서 주입) */
  modeRules: InsertionModeRules;
  asset: ProductAssetSpec;
  safeArea: ProductSafeArea;
  /** 최종 렌더 해상도 */
  canvasWidth: number;
  canvasHeight: number;
  /**
   * 제품 이미지의 최종 크기 (safe area + modeRules 기준으로 aspect ratio 보존 후 결정).
   * worker가 이 값을 그대로 사용한다.
   */
  renderWidth: number;
  renderHeight: number;
  /** safe area 내 배치 오프셋 */
  offsetX: number;
  offsetY: number;
  /** 배경 제거 필요 여부 */
  needsBackgroundRemoval: boolean;
  applyDropShadow: boolean;
}

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * Product insertion degrade 정책:
 *
 *   BG_REMOVAL_SKIPPED — autoRemoveBackground=true이지만 제거 실패 또는 skip.
 *                        원본 이미지 그대로 사용 (degrade, hard fail 아님).
 *   ASPECT_RATIO_PROBED — aspectRatio가 없어서 probe로 결정됨.
 *   OVERFLOW_CLIPPED    — safe area를 벗어나 clamp 처리됨.
 *   HANDHELD_FALLBACK   — handheld_supported → graphic_insert 폴백.
 *   SIZE_CAPPED         — 이미지가 maxWidthRatio/maxHeightRatio에 의해 축소됨.
 *
 * 위 모두 warning 기록 후 합성을 계속 진행한다. hard fail이 아님.
 */
export interface ProductInsertionWarning {
  code:
    | "BG_REMOVAL_SKIPPED"   // degrade: BG 제거 실패 → 원본 사용
    | "ASPECT_RATIO_PROBED"
    | "OVERFLOW_CLIPPED"
    | "HANDHELD_FALLBACK"
    | "SIZE_CAPPED";
  message: string;
}

export interface ProductInsertionResult {
  /** 합성 완료된 이미지의 R2 key */
  outputKey: string;
  mode: InsertionMode;
  warnings: ProductInsertionWarning[];
  durationMs: number;
}
