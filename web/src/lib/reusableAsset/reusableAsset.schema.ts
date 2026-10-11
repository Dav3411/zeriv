/**
 * reusableAsset/reusableAsset.schema.ts — Reusable asset Zod 스키마.
 */

import { z } from "zod";

// ─── Asset type / status ──────────────────────────────────────────────────────

export const ReusableAssetTypeSchema = z.enum([
  "scene_config",
  "copy_block",
  "product_config",
  "ending_config",
  "sequence_preset",
  "character_preset",
]);

export const AssetStatusSchema = z.enum([
  "draft",
  "approved",
  "rejected",
  "archived",
]);

/** apply API 허용 상태 — status=approved만 가능 */
export const APPLY_ALLOWED_STATUSES: readonly string[] = ["approved"] as const;

// ─── Payload schemas ──────────────────────────────────────────────────────────

/**
 * 각 payload 스키마는 type 필드를 discriminant로 가짐.
 * 실제 내부 필드의 세부 검증은 sceneRender/adSequence 각 모듈의 스키마에 위임.
 * 여기서는 구조 식별과 최소 필수 필드만 검증.
 */

const SceneConfigPayloadSchema = z.object({
  type: z.literal("scene_config"),
  templateCode: z.string().min(1).max(64),
  templateId: z.string().min(1),
  category: z.string().min(1).max(32),
  character: z.record(z.string(), z.unknown()),
  background: z.record(z.string(), z.unknown()).default({}),
  copy: z.record(z.string(), z.unknown()).default({}),
  product: z.record(z.string(), z.unknown()).default({}),
});

const CopyBlockPayloadSchema = z.object({
  type: z.literal("copy_block"),
  templateCode: z.string().max(64).nullable().default(null),
  category: z.string().max(32).nullable().default(null),
  slots: z.record(z.string().min(1), z.string().max(500)),
  language: z.string().min(2).max(10).default("ko"),
});

const ProductConfigPayloadSchema = z.object({
  type: z.literal("product_config"),
  productName: z.string().max(100).nullable().default(null),
  zones: z.record(z.string().min(1), z.object({
    imageUrl: z.string().min(1),
  }).passthrough()),
});

const EndingConfigPayloadSchema = z.object({
  type: z.literal("ending_config"),
  compositionInput: z.object({
    layoutMode: z.string().min(1),
    brandLogoUrl: z.string().optional(),
    productPackshotUrl: z.string().optional(),
    backgroundImageKey: z.string().optional(),
    backgroundColor: z.string().default("#000000"),
    ctaText: z.string().max(60).optional(),
    headlineText: z.string().max(80).optional(),
    subheadlineText: z.string().max(120).optional(),
    priceText: z.string().max(30).optional(),
    ctaColor: z.string().default("#FF3C3C"),
    disclaimerText: z.string().max(300).optional(),
  }),
});

const SequencePresetAssetRefSchema = z.object({
  assetId: z.string().min(1),
  assetType: ReusableAssetTypeSchema,
  slotOrZoneId: z.string().nullable().default(null),
});

// AdSceneSpec 필드는 unknown key 허용, 두 신규 필드만 명시적으로 검증
const SequencePresetSceneSchema = z.looseObject({
  templateSnapshotVersion: z.number().int().nullable().default(null),
  reusableAssetRefs: z.array(SequencePresetAssetRefSchema).default([]),
});

const SequencePresetPayloadSchema = z.object({
  type: z.literal("sequence_preset"),
  scenes: z.array(SequencePresetSceneSchema).min(2).max(10),
  outputOptions: z.record(z.string(), z.unknown()).default({}),
  validationSummary: z.record(z.string(), z.unknown()).nullable().default(null),
  sourceAdJobId: z.string().nullable().default(null),
  /** preset 생성 시점의 SequencePolicy 스냅샷 */
  sequencePolicySnapshot: z.object({
    requireEnding: z.boolean(),
  }).nullable().default(null),
});

const CharacterPresetPayloadSchema = z.object({
  type: z.literal("character_preset"),
  characterId: z.string().min(1),
  characterVersionId: z.string().nullable().default(null),
  outfit: z.string().max(64).nullable().default(null),
  expression: z.string().max(64).nullable().default(null),
  extra: z.record(z.string(), z.unknown()).nullable().default(null),
});

export const ReusableAssetPayloadSchema = z.discriminatedUnion("type", [
  SceneConfigPayloadSchema,
  CopyBlockPayloadSchema,
  ProductConfigPayloadSchema,
  EndingConfigPayloadSchema,
  SequencePresetPayloadSchema,
  CharacterPresetPayloadSchema,
]);

// ─── Create / save asset ──────────────────────────────────────────────────────

export const CreateReusableAssetSchema = z.object({
  brandId: z.string().min(1),
  campaignId: z.string().nullable().default(null),
  assetType: ReusableAssetTypeSchema,
  name: z.string().min(1).max(200),
  payload: ReusableAssetPayloadSchema,
  /** scene_render_job.id — 출처 추적용 */
  sourceSceneRenderJobId: z.string().nullable().default(null),
  /** ad_sequence_job.id — 출처 추적용 */
  sourceAdJobId: z.string().nullable().default(null),
  /**
   * 재현 가능성을 위한 resolved input 스냅샷.
   * 자산 생성 시점의 실제 입력값 전체를 저장.
   */
  sourceSnapshot: z.record(z.string(), z.unknown()).nullable().default(null),
  /**
   * template/schema 버전 식별자.
   * 형식: "<templateCode>@v<version>" 또는 "schema@<semver>"
   */
  sourceVersion: z.string().max(128).nullable().default(null),
  tags: z.array(z.string().max(50)).max(20).default([]),
  useCases: z.array(z.string().max(50)).max(10).default([]),
});

// ─── Approve / reject ─────────────────────────────────────────────────────────

export const ApproveAssetSchema = z.object({
  action: z.enum(["approved", "rejected", "revision_requested"]),
  note: z.string().max(500).optional(),
});

// ─── Update status ────────────────────────────────────────────────────────────

export const UpdateAssetStatusSchema = z.object({
  status: AssetStatusSchema,
});

// ─── List assets ──────────────────────────────────────────────────────────────

export const ListAssetsQuerySchema = z.object({
  brandId: z.string().optional(),
  campaignId: z.string().optional(),
  assetType: ReusableAssetTypeSchema.optional(),
  status: AssetStatusSchema.optional(),
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((t) => t.trim()) : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0)),
});

// ─── Brand memory ──────────────────────────────────────────────────────────────

const BrandRulesSnapshotSchema = z.object({
  requireEnding: z.boolean().default(false),
  maxSceneCount: z.number().int().min(2).max(10).default(10),
  allowedCategories: z.array(z.string()).default([]),
  note: z.string().max(300).nullable().default(null),
  frozenAt: z.string(),
});

export const UpdateBrandMemorySchema = z.object({
  approvedCopyBlocks: z.array(z.object({
    assetId: z.string(),
    name: z.string(),
    category: z.string().nullable(),
    language: z.string(),
    slotPreview: z.record(z.string(), z.string()),
  })).optional(),
  approvedEndingProfiles: z.array(z.object({
    assetId: z.string(),
    name: z.string(),
    layoutMode: z.string(),
    ctaText: z.string().nullable(),
    brandLogoUrl: z.string().nullable(),
  })).optional(),
  /** (이전: preferredTemplates) */
  preferredTemplateSet: z.array(z.object({
    templateCode: z.string(),
    templateId: z.string(),
    category: z.string(),
    note: z.string().nullable().default(null),
    isDefault: z.boolean().default(false),
  })).optional(),
  preferredCharacterPresets: z.array(z.object({
    assetId: z.string(),
    name: z.string(),
    characterId: z.string(),
    outfit: z.string().nullable().default(null),
    isDefault: z.boolean().default(false),
  })).optional(),
  winningSequencePatterns: z.array(z.object({
    categorySequence: z.array(z.string()).min(2).max(10),
    sceneCount: z.number().int().min(2).max(10),
    note: z.string().nullable().default(null),
    usageCount: z.number().int().min(0).default(0),
  })).optional(),
  savedProductConfigs: z.array(z.object({
    assetId: z.string(),
    name: z.string(),
    productName: z.string().nullable(),
    zoneIds: z.array(z.string()),
  })).optional(),
  brandRulesSnapshot: BrandRulesSnapshotSchema.nullable().optional(),
  defaultSequencePolicy: z.object({
    requireEnding: z.boolean(),
  }).nullable().optional(),
  extraMemory: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateReusableAssetInput = z.infer<typeof CreateReusableAssetSchema>;
export type ApproveAssetInput = z.infer<typeof ApproveAssetSchema>;
export type UpdateBrandMemoryInput = z.infer<typeof UpdateBrandMemorySchema>;
