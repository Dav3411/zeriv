/**
 * sceneCompose/text/text.schema.ts — Text rendering Zod 스키마 + typography preset 상수.
 */

import { z } from "zod";
import type { TextSlotKind, TypographyPreset } from "./text.types";

// ─── Typography presets ───────────────────────────────────────────────────────

/**
 * 슬롯 kind별 기본 타이포그래피 preset.
 * 템플릿이 font/color/size 필드를 재정의하지 않으면 이 값을 사용.
 *
 * 규칙 요약:
 *   hook_text       maxLines=2  overflow=scale_down  (훅은 반드시 완전히 표시)
 *   benefit_text    maxLines=4  overflow=truncate
 *   cta_text        maxLines=1  overflow=truncate     (pill 배경)
 *   price_text      maxLines=1  overflow=scale_down  (가격은 반드시 완전히 표시)
 *   disclaimer_text maxLines=3  overflow=clip        (법적 고지는 잘려도 무방)
 *   headline        maxLines=2  overflow=scale_down
 *   subheadline     maxLines=3  overflow=truncate
 *   body_copy       maxLines=5  overflow=truncate
 *   badge           maxLines=1  overflow=allow_overflow
 *   countdown       maxLines=1  overflow=scale_down
 */
export const TYPOGRAPHY_PRESETS: Record<TextSlotKind, TypographyPreset> = {
  // ── Ad-domain kinds ────────────────────────────────────────────────────────
  hook_text: {
    fontFamily: "Pretendard",
    fontWeight: 800,
    fontSizeVh: 6.5,
    lineHeightRatio: 1.15,
    letterSpacingEm: -0.03,
    color: "#FFFFFF",
    maxLines: 2,
    overflowPolicy: "scale_down",
    shadow: { offsetX: 0, offsetY: 3, blur: 12, color: "rgba(0,0,0,0.7)" },
    backgroundPill: null,
  },
  benefit_text: {
    fontFamily: "Pretendard",
    fontWeight: 500,
    fontSizeVh: 3.0,
    lineHeightRatio: 1.5,
    letterSpacingEm: -0.01,
    color: "#F0F0F0",
    maxLines: 4,
    overflowPolicy: "truncate",
    shadow: { offsetX: 0, offsetY: 1, blur: 6, color: "rgba(0,0,0,0.5)" },
    backgroundPill: null,
  },
  cta_text: {
    fontFamily: "Pretendard",
    fontWeight: 700,
    fontSizeVh: 3.2,
    lineHeightRatio: 1.1,
    letterSpacingEm: 0.01,
    color: "#FFFFFF",
    maxLines: 1,
    overflowPolicy: "truncate",
    shadow: null,
    backgroundPill: {
      paddingX: 28,
      paddingY: 14,
      color: "rgba(255,60,60,0.92)",
      borderRadius: 36,
    },
  },
  price_text: {
    fontFamily: "Pretendard",
    fontWeight: 800,
    fontSizeVh: 7.0,
    lineHeightRatio: 1.0,
    letterSpacingEm: -0.03,
    color: "#FFFFFF",
    maxLines: 1,
    overflowPolicy: "scale_down",
    shadow: { offsetX: 0, offsetY: 2, blur: 10, color: "rgba(0,0,0,0.5)" },
    backgroundPill: null,
  },
  disclaimer_text: {
    fontFamily: "Pretendard",
    fontWeight: 300,
    fontSizeVh: 1.4,
    lineHeightRatio: 1.4,
    letterSpacingEm: 0,
    color: "rgba(255,255,255,0.55)",
    maxLines: 3,
    overflowPolicy: "clip",
    shadow: null,
    backgroundPill: null,
  },
  // ── General-purpose kinds ──────────────────────────────────────────────────
  headline: {
    fontFamily: "Pretendard",
    fontWeight: 700,
    fontSizeVh: 5.5,
    lineHeightRatio: 1.2,
    letterSpacingEm: -0.02,
    color: "#FFFFFF",
    maxLines: 2,
    overflowPolicy: "scale_down",
    shadow: { offsetX: 0, offsetY: 2, blur: 8, color: "rgba(0,0,0,0.6)" },
    backgroundPill: null,
  },
  subheadline: {
    fontFamily: "Pretendard",
    fontWeight: 500,
    fontSizeVh: 3.5,
    lineHeightRatio: 1.3,
    letterSpacingEm: -0.01,
    color: "#F0F0F0",
    maxLines: 3,
    overflowPolicy: "truncate",
    shadow: { offsetX: 0, offsetY: 1, blur: 6, color: "rgba(0,0,0,0.5)" },
    backgroundPill: null,
  },
  body_copy: {
    fontFamily: "Pretendard",
    fontWeight: 400,
    fontSizeVh: 2.5,
    lineHeightRatio: 1.5,
    letterSpacingEm: 0,
    color: "#E8E8E8",
    maxLines: 5,
    overflowPolicy: "truncate",
    shadow: null,
    backgroundPill: null,
  },
  badge: {
    fontFamily: "Pretendard",
    fontWeight: 700,
    fontSizeVh: 2.2,
    lineHeightRatio: 1.0,
    letterSpacingEm: 0.02,
    color: "#FFFFFF",
    maxLines: 1,
    overflowPolicy: "allow_overflow",
    shadow: null,
    backgroundPill: {
      paddingX: 12,
      paddingY: 6,
      color: "rgba(255,80,0,0.9)",
      borderRadius: 8,
    },
  },
  countdown: {
    fontFamily: "Pretendard",
    fontWeight: 900,
    fontSizeVh: 8.0,
    lineHeightRatio: 1.0,
    letterSpacingEm: -0.04,
    color: "#FFFFFF",
    maxLines: 1,
    overflowPolicy: "scale_down",
    shadow: { offsetX: 0, offsetY: 4, blur: 16, color: "rgba(0,0,0,0.7)" },
    backgroundPill: null,
  },
};

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const TextSlotKindSchema = z.enum([
  // Ad-domain
  "hook_text",
  "benefit_text",
  "cta_text",
  "price_text",
  "disclaimer_text",
  // General-purpose
  "headline",
  "subheadline",
  "body_copy",
  "badge",
  "countdown",
]);

export const TextRenderInputSchema = z.object({
  slotId: z.string().min(1).max(64),
  kind: TextSlotKindSchema,
  text: z.string().min(1).max(500),
  /** 템플릿이 정의한 maxChars 제한 (없으면 500) */
  maxChars: z.number().int().positive().default(500),
  /** 타이포그래피 재정의 (partial) */
  typographyOverride: z
    .object({
      fontFamily: z.string().optional(),
      fontWeight: z.number().optional(),
      fontSizeVh: z.number().optional(),
      color: z.string().optional(),
      maxLines: z.number().int().positive().optional(),
    })
    .optional(),
});

export type TextRenderInput = z.infer<typeof TextRenderInputSchema>;
