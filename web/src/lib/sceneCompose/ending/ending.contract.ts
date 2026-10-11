/**
 * sceneCompose/ending/ending.contract.ts
 *
 * Ending composition module의 실행 가능한 contract 정의.
 * /api/internal/scene-ending-compose worker와의 경계를 고정한다.
 *
 * 적용 조건: category=ending && shotType=static_hybrid
 * 이 조건이 아니면 scene_ending_compose 스텝 자체가 큐에 없음.
 *
 * v0.1 구현 대상:  character_packshot_logo, cta_dominant
 * v0.2 구현 예정:  packshot_offer_logo, disclaimer_included
 * TODO(미구현):    custom 레이아웃 요소 자유 배치
 */

import type {
  EndingLayoutMode,
  EndingCompositionProfile,
  EndingCompositionConstraints,
  EndingCompositionResult,
  EndingElementKind,
} from "./ending.types";
import type { EndingCompositionInput } from "./ending.schema";

// ─── Build input ──────────────────────────────────────────────────────────────

/**
 * orchestrator가 ending_compose 스텝 시작 시 worker에 전달하는 완성 입력.
 * EndingCompositionInput + 렌더 컨텍스트 정보를 합친 구조.
 */
export interface EndingCompositionBuildInput {
  /** scene_job_id */
  sceneJobId: string;
  /** 사용자 입력 (snapshot에서 파싱) */
  compositionInput: EndingCompositionInput;
  /**
   * scene_composition 스텝의 출력 이미지 R2 key.
   * requiresCharacterLayer=true인 프로필에서 base layer로 사용.
   * null이면 character_packshot_logo 프로필 실행 불가.
   */
  characterLayerKey: string | null;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  durationFrames: number;
  /** 템플릿에서 파생된 제약 */
  constraints: EndingCompositionConstraints;
}

// ─── Profile resolution ───────────────────────────────────────────────────────

/**
 * layoutMode별 필수 입력 필드와 requiresCharacterLayer 값.
 *
 * orchestrator가 EndingCompositionBuildInput을 받으면
 * PROFILE_REQUIREMENTS 테이블로 빠른 validation을 먼저 수행한다.
 */
export interface EndingProfileRequirements {
  requiresCharacterLayer: boolean;
  requiredInputFields: (keyof EndingCompositionInput)[];
  requiredElements: EndingElementKind[];
}

export const PROFILE_REQUIREMENTS: Record<EndingLayoutMode, EndingProfileRequirements> = {
  character_packshot_logo: {
    requiresCharacterLayer: true,
    requiredInputFields: ["brandLogoUrl", "productPackshotUrl"],
    requiredElements: ["brand_logo", "product_packshot"],
  },
  packshot_offer_logo: {
    requiresCharacterLayer: false,
    requiredInputFields: ["brandLogoUrl", "productPackshotUrl"],
    requiredElements: ["brand_logo", "product_packshot", "offer_badge"],
  },
  cta_dominant: {
    requiresCharacterLayer: false,
    requiredInputFields: ["ctaText"],
    requiredElements: ["cta_button"],
  },
  disclaimer_included: {
    requiresCharacterLayer: false,  // 내부 baseMode에 따라 상속
    requiredInputFields: ["ctaText"],  // + disclaimerText 필수
    requiredElements: ["cta_button", "legal_text"],
  },
  logo_cta: {
    requiresCharacterLayer: false,
    requiredInputFields: ["ctaText"],
    requiredElements: ["cta_button"],
  },
  brand_full: {
    requiresCharacterLayer: false,
    requiredInputFields: ["brandLogoUrl"],
    requiredElements: ["brand_logo"],
  },
  custom: {
    requiresCharacterLayer: false,
    requiredInputFields: [],
    requiredElements: [],
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────

export interface EndingCompositionValidationResult {
  valid: boolean;
  /** validation 실패 시 누락된 필드/조건 목록 */
  missingRequired: string[];
  errorCode?: EndingCompositionErrorCode;
}

/**
 * profile resolution 전 실행하는 pre-flight validation.
 *
 * 검사 항목:
 *   1. requiresCharacterLayer=true && characterLayerKey=null → 에러
 *   2. requiredInputFields 중 누락된 것 → 에러
 *   3. disclaimer_included && compositionInput에 disclaimerText 없음 → 에러
 *   4. constraints.requireBrandLogo && brandLogoUrl 없음 → 에러
 *   5. constraints.requireProductPackshot && productPackshotUrl 없음 → 에러
 */
export function validateEndingCompositionBuildInput(
  input: EndingCompositionBuildInput
): EndingCompositionValidationResult {
  const req = PROFILE_REQUIREMENTS[input.compositionInput.layoutMode];
  const missing: string[] = [];

  if (req.requiresCharacterLayer && !input.characterLayerKey) {
    return { valid: false, missingRequired: ["characterLayerKey"], errorCode: "ENDING_CHARACTER_LAYER_MISSING" };
  }

  for (const field of req.requiredInputFields) {
    if (!input.compositionInput[field]) {
      missing.push(field as string);
    }
  }

  // disclaimer_included 모드 또는 constraints.requireDisclaimer=true → disclaimerText 필수
  // disclaimer 누락은 hard fail (legal_text 없이 렌더 불가 — legal 리스크)
  const needsDisclaimer =
    input.compositionInput.layoutMode === "disclaimer_included" ||
    input.constraints.requireDisclaimer;
  if (needsDisclaimer && !input.compositionInput.disclaimerText) {
    missing.push("disclaimerText (required for disclaimer_included or requireDisclaimer=true)");
  }

  if (input.constraints.requireBrandLogo && !input.compositionInput.brandLogoUrl) {
    missing.push("brandLogoUrl (constraint: requireBrandLogo=true)");
  }

  if (input.constraints.requireProductPackshot && !input.compositionInput.productPackshotUrl) {
    missing.push("productPackshotUrl (constraint: requireProductPackshot=true)");
  }

  if (missing.length > 0) {
    return { valid: false, missingRequired: missing, errorCode: "ENDING_REQUIRED_FIELDS_MISSING" };
  }

  return { valid: true, missingRequired: [] };
}

// ─── Worker payload ───────────────────────────────────────────────────────────

/**
 * /api/internal/scene-ending-compose → worker로 전달되는 페이로드.
 * profile은 orchestrator가 buildInput에서 완전히 조립한 후 전달.
 */
export interface EndingComposeWorkerPayload {
  sceneJobId: string;
  profile: EndingCompositionProfile;
}

// ─── Worker response ──────────────────────────────────────────────────────────

export interface EndingComposeWorkerResponse {
  ok: boolean;
  outputImageKey?: string;
  endingResult?: EndingCompositionResult;
  durationMs?: number;
  error?: string;
  errorCode?: EndingCompositionErrorCode;
}

// ─── Error codes ──────────────────────────────────────────────────────────────

export type EndingCompositionErrorCode =
  | "ENDING_CHARACTER_LAYER_MISSING"   // requiresCharacterLayer && no characterLayerKey (non-retryable)
  | "ENDING_REQUIRED_FIELDS_MISSING"   // required input field 누락 (non-retryable)
  | "ENDING_LOGO_ASSET_NOT_FOUND"      // brandLogoUrl 404 (retryable)
  | "ENDING_PACKSHOT_ASSET_NOT_FOUND"  // productPackshotUrl 404 (retryable)
  | "ENDING_COMPOSE_FAILED";           // 합성 실행 실패 (retryable)

// ─── Retry policy ─────────────────────────────────────────────────────────────

export const ENDING_COMPOSE_RETRY_POLICY = {
  maxRetries: 2,
  retryableErrorCodes: [
    "ENDING_LOGO_ASSET_NOT_FOUND",
    "ENDING_PACKSHOT_ASSET_NOT_FOUND",
    "ENDING_COMPOSE_FAILED",
  ] as EndingCompositionErrorCode[],
  nonRetryableErrorCodes: [
    "ENDING_CHARACTER_LAYER_MISSING",
    "ENDING_REQUIRED_FIELDS_MISSING",
  ] as EndingCompositionErrorCode[],
} as const;
