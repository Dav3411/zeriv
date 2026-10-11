/**
 * sceneCompose/ending/ending.types.ts — Ending composition 타입 정의.
 *
 * category=ending && shotType=static_hybrid 씬 전용.
 * scene_ending_compose 스텝에서 처리.
 *
 * 특징:
 *   - 모델 애니메이션 없음 (static_hybrid = 정적 레이아웃 + 배경 합성)
 *   - 브랜드 로고 / 제품 팩샷 / CTA 텍스트를 그래픽으로 조립
 *   - scene_composition 결과 위에 overlay로 최종 조립
 */

// ─── Layout mode ──────────────────────────────────────────────────────────────

/**
 * ending 씬의 레이아웃 구성 모드.
 *
 * Named profiles (4가지 대표 레이아웃):
 *   character_packshot_logo  — 캐릭터 + 제품 팩샷 + 브랜드 로고
 *                              (scene_composition 위에 팩샷+로고 overlay)
 *   packshot_offer_logo      — 제품 팩샷 + 할인/오퍼 배지 + 브랜드 로고
 *                              (캐릭터 없이 팩샷 중심)
 *   cta_dominant             — CTA 버튼 중심 ending
 *                              (로고 + 대형 CTA, 팩샷 선택적)
 *   disclaimer_included      — 위 3가지 중 하나 + 하단 면책 조항 포함
 *                              (legal_text 요소 필수)
 *
 * 그 외:
 *   logo_cta                 — 로고 + CTA 텍스트만 (간결)
 *   brand_full               — 브랜드 풀페이지 (로고 중앙, 서브텍스트)
 *   custom                   — 완전 커스텀 요소 배치
 */
export type EndingLayoutMode =
  // ── Named profiles (4 standard)
  | "character_packshot_logo"  // 캐릭터 + 팩샷 + 로고
  | "packshot_offer_logo"      // 팩샷 + 오퍼 배지 + 로고 (캐릭터 없음)
  | "cta_dominant"             // 대형 CTA 중심
  | "disclaimer_included"      // 어떤 레이아웃이든 + 면책 조항 하단
  // ── General
  | "logo_cta"                 // 로고 + CTA 텍스트만
  | "brand_full"               // 브랜드 풀페이지
  | "custom";                  // 완전 커스텀

// ─── Element kinds ────────────────────────────────────────────────────────────

export type EndingElementKind =
  | "brand_logo"
  | "product_packshot"
  | "headline_text"
  | "subheadline_text"
  | "cta_button"
  | "price_badge"
  | "offer_badge"       // 할인율/오퍼 배지 (packshot_offer_logo에서 사용)
  | "legal_text"        // 면책 조항/disclaimer (disclaimer_included에서 필수)
  | "background_overlay"
  | "divider";

// ─── Elements ─────────────────────────────────────────────────────────────────

export interface EndingElement {
  kind: EndingElementKind;
  /** 캔버스 내 절대 좌표 (픽셀) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 요소별 데이터 */
  data: EndingElementData;
  /** z-order (낮을수록 뒤) */
  zIndex: number;
  /** 페이드인 프레임 (없으면 첫 프레임부터) */
  fadeInFrame?: number;
}

export type EndingElementData =
  | { kind: "brand_logo"; imageUrl: string; opacity: number }
  | { kind: "product_packshot"; imageUrl: string; hasAlpha: boolean; dropShadow: boolean }
  | { kind: "headline_text"; text: string; fontFamily: string; fontWeight: number; fontSize: number; color: string }
  | { kind: "subheadline_text"; text: string; fontFamily: string; fontWeight: number; fontSize: number; color: string }
  | { kind: "cta_button"; text: string; bgColor: string; textColor: string; borderRadius: number }
  | { kind: "price_badge"; text: string; bgColor: string; textColor: string }
  | { kind: "offer_badge"; text: string; bgColor: string; textColor: string; strikethroughText?: string }
  | { kind: "legal_text"; text: string; fontSize: number; color: string; maxLines: number }
  | { kind: "background_overlay"; color: string; opacity: number }
  | { kind: "divider"; color: string; thickness: number };

// ─── Composition profile ──────────────────────────────────────────────────────

/**
 * ending 씬 전체 조립 프로필.
 * orchestrator가 template + snapshot에서 조립해 worker에 전달.
 */
export interface EndingCompositionProfile {
  layoutMode: EndingLayoutMode;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  durationFrames: number;
  /** 배경 이미지 R2 key (없으면 단색) */
  backgroundImageKey: string | null;
  backgroundColor: string;
  /**
   * scene_composition 결과(캐릭터 합성 이미지)를 배경으로 사용할지.
   * true → scene_composition outputKey를 base layer로 사용
   * false → backgroundImageKey / backgroundColor만 사용
   *
   * character_packshot_logo: true
   * packshot_offer_logo: false
   * cta_dominant: false (선택적)
   * disclaimer_included: layoutMode에 따라 상속
   */
  requiresCharacterLayer: boolean;
  elements: EndingElement[];
}

// ─── Constraints ──────────────────────────────────────────────────────────────

/**
 * 템플릿 정의에서 파생된 ending 조립 제약.
 */
export interface EndingCompositionConstraints {
  /** 허용되는 layout mode 목록 */
  allowedLayoutModes: EndingLayoutMode[];
  /** 브랜드 로고 요소 필수 여부 */
  requireBrandLogo: boolean;
  /** 제품 팩샷 필수 여부 */
  requireProductPackshot: boolean;
  /**
   * 법적 고지 텍스트 필수 여부.
   * disclaimer_included 모드에서 true.
   */
  requireDisclaimer: boolean;
  /** 최소/최대 텍스트 요소 수 */
  minTextElements: number;
  maxTextElements: number;
  /** safe zone 마진 (픽셀) */
  safeZoneMargin: number;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface EndingCompositionResult {
  outputKey: string;
  layoutMode: EndingLayoutMode;
  renderedElementKinds: EndingElementKind[];
  durationMs: number;
}
