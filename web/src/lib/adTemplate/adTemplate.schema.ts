/**
 * adTemplate.schema.ts — Zod validation schemas + inferred input types.
 *
 * 모든 API 입력은 이 파일의 스키마로 파싱·검증된다.
 * TypeScript 타입은 Zod에서 추론되므로 별도 interface 중복 없음.
 */

import { z } from "zod";

// ─── Primitive enums ──────────────────────────────────────────────────────────

export const AdTemplateCategorySchema = z.enum([
  "hook",
  "product_show",
  "benefit",
  "lifestyle",
  "cta",
  "ending",
]);

export const AdTemplateShotTypeSchema = z.enum([
  "full_body",
  "upper_body",
  "product_aware",
  "static_hybrid",
]);

export const AdTemplateStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "deprecated",
]);

export const AspectRatioSchema = z.enum(["9:16", "1:1", "16:9"]);

// ─── Text slot ────────────────────────────────────────────────────────────────

export const TextAnchorSchema = z.enum([
  "top_left", "top_center", "top_right",
  "middle_left", "middle_center", "middle_right",
  "bottom_left", "bottom_center", "bottom_right",
]);

export const TextSlotSchema = z.object({
  slotId: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  defaultText: z.string().max(200).default(""),
  maxChars: z.number().int().min(1).max(500),
  required: z.boolean(),
  placement: z.object({
    xNorm: z.number().min(0).max(1),
    yNorm: z.number().min(0).max(1),
    anchor: TextAnchorSchema,
  }),
  timing: z.object({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
  }).refine((t) => t.endSec > t.startSec, {
    message: "timing.endSec must be greater than timing.startSec",
  }),
  style: z.object({
    suggestedSize: z.enum(["small", "medium", "large", "xlarge"]),
    suggestedWeight: z.enum(["normal", "semibold", "bold"]),
    colorSuggestion: z.enum(["white", "white_with_shadow", "black", "brand_primary", "auto"]),
  }),
});

// ─── Product zone ─────────────────────────────────────────────────────────────

export const ProductZoneSchema = z.object({
  zoneId: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  insertionType: z.enum(["static", "animated_float", "character_hold", "overlay_badge"]),
  boundingBox: z.object({
    xNorm: z.number().min(0).max(1),
    yNorm: z.number().min(0).max(1),
    wNorm: z.number().min(0.01).max(1),
    hNorm: z.number().min(0.01).max(1),
  }).refine((b) => b.xNorm + b.wNorm <= 1.001, { message: "xNorm + wNorm must be ≤ 1" })
    .refine((b) => b.yNorm + b.hNorm <= 1.001, { message: "yNorm + hNorm must be ≤ 1" }),
  zDepth: z.enum(["foreground", "behind_character", "background"]),
  timing: z.object({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
  }).refine((t) => t.endSec > t.startSec, {
    message: "timing.endSec must be greater than timing.startSec",
  }),
  constraints: z.object({
    minAspectRatio: z.number().min(0.1).max(10),
    maxAspectRatio: z.number().min(0.1).max(10),
    allowTransparentBg: z.boolean(),
  }),
});

// ─── Character constraints ────────────────────────────────────────────────────

export const CharacterConstraintsSchema = z.object({
  modeTypes: z.array(z.enum(["realistic", "25d"])).min(1),
  outfitCategories: z.array(z.string().min(1)).default([]),
  expressionStyle: z.enum(["natural", "expressive", "neutral"]),
  hairLengthConstraint: z.enum(["any", "short_preferred", "long_preferred"]).default("any"),
  genderConstraint: z.enum(["any", "female_preferred", "male_preferred"]).default("any"),
  minBeautyStrength: z.number().min(0).max(1).default(0),
  maxBeautyStrength: z.number().min(0).max(1).default(1),
}).refine((c) => c.minBeautyStrength <= c.maxBeautyStrength, {
  message: "minBeautyStrength must be ≤ maxBeautyStrength",
});

// ─── Transition config ────────────────────────────────────────────────────────

export const TransitionTypeSchema = z.enum([
  "cut", "fade_in", "fade_out",
  "slide_up", "slide_down", "slide_left", "slide_right",
  "zoom_in", "zoom_out",
]);

export const TransitionConfigSchema = z.object({
  inTransitions: z.array(TransitionTypeSchema).default(["cut"]),
  outTransitions: z.array(TransitionTypeSchema).default(["cut"]),
  recommendedPrevCategories: z.array(AdTemplateCategorySchema).default([]),
  recommendedNextCategories: z.array(AdTemplateCategorySchema).default([]),
  audioContinuity: z.boolean().default(false),
});

// ─── Assets ───────────────────────────────────────────────────────────────────

export const AdTemplateAssetsSchema = z.object({
  poseDataKey: z.string().min(1).nullable().default(null),
  faceSignalKey: z.string().min(1).nullable().default(null),
  footContactKey: z.string().min(1).nullable().default(null),
  personBboxTimelineKey: z.string().min(1).nullable().default(null),
  audioHintKey: z.string().min(1).nullable().default(null),
  thumbnailKey: z.string().min(1).nullable().default(null),
  proxyVideoKey: z.string().min(1).nullable().default(null),
});

// ─── Quality meta ─────────────────────────────────────────────────────────────

export const QualityMetaSchema = z.object({
  qualityScore: z.number().min(0).max(100).nullable().default(null),
  poseQualityScore: z.number().min(0).max(100).nullable().default(null),
  faceQualityScore: z.number().min(0).max(100).nullable().default(null),
  lightingScore: z.number().min(0).max(100).nullable().default(null),
  usageCount: z.number().int().min(0).default(0),
  avgRenderSuccessRate: z.number().min(0).max(1).nullable().default(null),
  knownIssues: z.array(z.string()).default([]),
});

// ─── Register ─────────────────────────────────────────────────────────────────

export const RegisterAdTemplateSchema = z.object({
  templateCode: z
    .string()
    .min(4)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "templateCode must be lowercase alphanumeric and underscores only"),
  displayName: z.string().min(2).max(120),
  description: z.string().max(500).default(""),

  category: AdTemplateCategorySchema,
  shotType: AdTemplateShotTypeSchema,

  durationSec: z.number().min(0.5).max(60),
  fps: z.number().min(1).max(120),
  frameCount: z.number().int().positive(),
  aspectRatio: AspectRatioSchema.default("9:16"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),

  assets: AdTemplateAssetsSchema,

  textSlots: z.array(TextSlotSchema).max(6).default([]),
  productZones: z.array(ProductZoneSchema).max(4).default([]),
  characterConstraints: CharacterConstraintsSchema,
  transitionConfig: TransitionConfigSchema,
  brandFitTags: z.array(z.string().min(1).max(40)).max(10).default([]),

  qualityMeta: QualityMetaSchema.partial().optional(),
  isPremium: z.boolean().default(false),
})
  // pose/faceSignal required except for static_hybrid
  .refine(
    (d) => d.shotType === "static_hybrid" || !!d.assets.poseDataKey,
    { message: "assets.poseDataKey is required for non-static_hybrid shotTypes", path: ["assets", "poseDataKey"] }
  )
  .refine(
    (d) => d.shotType === "static_hybrid" || !!d.assets.faceSignalKey,
    { message: "assets.faceSignalKey is required for non-static_hybrid shotTypes", path: ["assets", "faceSignalKey"] }
  )
  .refine(
    (d) => !!d.assets.thumbnailKey,
    { message: "assets.thumbnailKey is required", path: ["assets", "thumbnailKey"] }
  );

// ─── Admin full update ────────────────────────────────────────────────────────

export const AdminUpdateAdTemplateSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  category: AdTemplateCategorySchema.optional(),
  shotType: AdTemplateShotTypeSchema.optional(),
  durationSec: z.number().min(0.5).max(60).optional(),
  fps: z.number().min(1).max(120).optional(),
  frameCount: z.number().int().positive().optional(),
  aspectRatio: AspectRatioSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  assets: AdTemplateAssetsSchema.partial().optional(),
  textSlots: z.array(TextSlotSchema).max(6).optional(),
  productZones: z.array(ProductZoneSchema).max(4).optional(),
  characterConstraints: CharacterConstraintsSchema.optional(),
  transitionConfig: TransitionConfigSchema.optional(),
  brandFitTags: z.array(z.string().min(1).max(40)).max(10).optional(),
  qualityMeta: QualityMetaSchema.partial().optional(),
  isPremium: z.boolean().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: "At least one field must be provided for update" }
);

// ─── Status update ────────────────────────────────────────────────────────────

export const UpdateAdTemplateStatusSchema = z.object({
  status: AdTemplateStatusSchema,
  rejectionReason: z.string().max(500).optional(),
});

// ─── List query ───────────────────────────────────────────────────────────────

export const ListAdTemplatesQuerySchema = z.object({
  category: AdTemplateCategorySchema.optional(),
  shotType: AdTemplateShotTypeSchema.optional(),
  brandFitTags: z
    .string()
    .optional()
    .transform((v) => v?.split(",").map((t) => t.trim()).filter(Boolean)),
  isPremium: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(100, Math.max(1, parseInt(v, 10))) : 20)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? Math.max(0, parseInt(v, 10)) : 0)),
});

export const AdminListAdTemplatesQuerySchema = ListAdTemplatesQuerySchema.extend({
  status: AdTemplateStatusSchema.optional(), // admin can filter all statuses
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type RegisterAdTemplateInput = z.infer<typeof RegisterAdTemplateSchema>;
export type AdminUpdateAdTemplateInput = z.infer<typeof AdminUpdateAdTemplateSchema>;
export type UpdateAdTemplateStatusInput = z.infer<typeof UpdateAdTemplateStatusSchema>;
export type ListAdTemplatesQuery = z.infer<typeof ListAdTemplatesQuerySchema>;
export type AdminListAdTemplatesQuery = z.infer<typeof AdminListAdTemplatesQuerySchema>;
export type TextSlotInput = z.infer<typeof TextSlotSchema>;
export type ProductZoneInput = z.infer<typeof ProductZoneSchema>;
export type CharacterConstraintsInput = z.infer<typeof CharacterConstraintsSchema>;
export type TransitionConfigInput = z.infer<typeof TransitionConfigSchema>;
export type AdTemplateAssetsInput = z.infer<typeof AdTemplateAssetsSchema>;
export type QualityMetaInput = z.infer<typeof QualityMetaSchema>;
