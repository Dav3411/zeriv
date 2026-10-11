/**
 * sceneCompose/ending/ending.schema.ts — Ending composition Zod 스키마.
 */

import { z } from "zod";

export const EndingLayoutModeSchema = z.enum([
  // Named profiles
  "character_packshot_logo",
  "packshot_offer_logo",
  "cta_dominant",
  "disclaimer_included",
  // General
  "logo_cta",
  "brand_full",
  "custom",
]);

export const EndingCompositionInputSchema = z.object({
  layoutMode: EndingLayoutModeSchema.default("character_packshot_logo"),
  /** 브랜드 로고 R2 key 또는 공개 URL (없으면 로고 요소 생략) */
  brandLogoUrl: z.string().optional(),
  /** 제품 팩샷 이미지 URL */
  productPackshotUrl: z.string().optional(),
  /** 배경 이미지 R2 key (없으면 backgroundColor 단색 사용) */
  backgroundImageKey: z.string().optional(),
  backgroundColor: z.string().default("#000000"),
  /** CTA 텍스트 */
  ctaText: z.string().max(60).optional(),
  /** 헤드라인 텍스트 */
  headlineText: z.string().max(80).optional(),
  /** 서브헤드라인 텍스트 */
  subheadlineText: z.string().max(120).optional(),
  /** 가격 표시 텍스트 (예: "₩29,900") */
  priceText: z.string().max(30).optional(),
  /** CTA 버튼 배경 색상 */
  ctaColor: z.string().default("#FF3C3C"),
  /**
   * 면책 조항 / 법적 고지 텍스트.
   * disclaimer_included 모드 또는 constraints.requireDisclaimer=true 시 필수.
   * 없으면 validateEndingCompositionBuildInput()에서 ENDING_REQUIRED_FIELDS_MISSING 반환.
   */
  disclaimerText: z.string().max(300).optional(),
});

export type EndingCompositionInput = z.infer<typeof EndingCompositionInputSchema>;
