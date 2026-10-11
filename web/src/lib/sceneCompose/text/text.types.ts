/**
 * sceneCompose/text/text.types.ts — Text rendering 타입 정의.
 *
 * 규칙 기반 텍스트 렌더링 (AI-free).
 * 템플릿의 text_slot 정의 + 입력 텍스트 → 최종 합성 스펙을 생성.
 */

// ─── Text slot kinds ──────────────────────────────────────────────────────────

/**
 * 텍스트 슬롯의 의미적 역할 (광고 도메인 기준).
 *
 * 광고 도메인 kinds (ad-specific):
 *   hook_text       — 훅 카피 (씬 초반 주의 집중용, 크고 임팩트 있게)
 *   benefit_text    — 혜택/기능 설명 (본문급 크기, 가독성 우선)
 *   cta_text        — CTA 문구 (버튼 pill 형태, 짧고 강렬하게)
 *   price_text      — 가격 표시 (숫자 강조, 통화 기호 포함)
 *   disclaimer_text — 법적 고지/면책 조항 (최소 크기, 하단 고정)
 *
 * 범용 typography kinds (general-purpose):
 *   headline        — 메인 헤드라인
 *   subheadline     — 서브 헤드라인
 *   body_copy       — 일반 본문
 *   badge           — 작은 배지/태그
 *   countdown       — 숫자 카운트다운
 */
export type TextSlotKind =
  // ── Ad-domain kinds
  | "hook_text"
  | "benefit_text"
  | "cta_text"
  | "price_text"
  | "disclaimer_text"
  // ── General-purpose kinds
  | "headline"
  | "subheadline"
  | "body_copy"
  | "badge"
  | "countdown";

// ─── Overflow policy ──────────────────────────────────────────────────────────

/**
 * 텍스트가 safe area를 벗어날 때 처리 정책.
 *
 *   truncate     — 글자 수 잘라내고 '…' 추가 (기본)
 *   scale_down   — 폰트 크기를 줄여서 safe area 내에 맞춤
 *   allow_overflow — 경고만 발생, 실제로 잘리지 않음 (badge 등 단어 단위)
 *   clip         — 픽셀 단위 clip (이미지 레이어로 마스킹)
 */
export type OverflowPolicy = "truncate" | "scale_down" | "allow_overflow" | "clip";

// ─── Safe area position hint ──────────────────────────────────────────────────

/**
 * 템플릿 설계자가 지정하는 safe area의 캔버스 내 위치 역할.
 * orchestrator가 절대 좌표로 변환하기 전 템플릿 JSONB에 저장되는 값.
 */
export type SafeAreaPosition =
  | "top_overlay"       // 상단 오버레이 (hook_text 전형적 위치)
  | "center_overlay"    // 중앙 오버레이
  | "bottom_bar"        // 하단 바 (benefit_text, CTA)
  | "bottom_disclaimer" // 최하단 법적 고지 영역
  | "custom";           // 절대 좌표로 직접 지정

// ─── Typography preset ────────────────────────────────────────────────────────

/**
 * 슬롯 kind별로 미리 정의된 타이포그래피 스펙.
 * 템플릿이 재정의하지 않으면 이 preset을 그대로 사용.
 */
export interface TypographyPreset {
  fontFamily: string;
  fontWeight: number;     // 100–900
  fontSizeVh: number;     // 캔버스 높이 대비 % (vh 단위)
  lineHeightRatio: number; // font size 대비 line height 배수
  letterSpacingEm: number;
  color: string;          // hex or rgba
  /** 최대 줄 수. 초과 시 overflowPolicy에 따라 처리 */
  maxLines: number;
  /** safe area 초과 시 처리 정책 */
  overflowPolicy: OverflowPolicy;
  /** 텍스트 그림자 (없으면 null) */
  shadow: {
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
  } | null;
  /** 텍스트 배경 pill/rect (없으면 null) */
  backgroundPill: {
    paddingX: number;
    paddingY: number;
    color: string;
    borderRadius: number;
  } | null;
}

// ─── Safe area ────────────────────────────────────────────────────────────────

export interface TextSafeArea {
  /** 캔버스 절대 좌표 (픽셀) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 위치 역할 힌트 (orchestrator → worker 전달용) */
  position: SafeAreaPosition;
  /** 텍스트 정렬 */
  textAlign: "left" | "center" | "right";
  /** 세로 기준점 */
  verticalAnchor: "top" | "middle" | "bottom";
}

// ─── Render spec ──────────────────────────────────────────────────────────────

/**
 * text_composite 스텝이 실제 렌더에 사용하는 완성된 스펙.
 */
export interface TextRenderSpec {
  slotId: string;
  kind: TextSlotKind;
  /** maxChars + maxLines 적용 + 줄바꿈 처리된 최종 텍스트 */
  resolvedText: string;
  typography: TypographyPreset;
  safeArea: TextSafeArea;
  /** 애니메이션 인/아웃 프레임 범위 (없으면 전체 구간 표시) */
  animation: {
    fadeInFrame: number;
    fadeOutFrame: number;
  } | null;
  canvasWidth: number;
  canvasHeight: number;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface TextRenderWarning {
  code: "TEXT_TRUNCATED" | "FONT_FALLBACK" | "OVERFLOW_CLIPPED" | "LINES_CAPPED";
  slotId: string;
  message: string;
}

export interface TextRenderResult {
  outputKey: string;
  renderedSlots: string[];
  warnings: TextRenderWarning[];
  durationMs: number;
}
