/**
 * sceneRender.schema.ts — Scene render job 입력 Zod 스키마.
 *
 * 하나의 ad template을 기반으로 scene 1개를 생성하는 job의 입력을 정의한다.
 * 입력은 크게 4가지 축으로 구성된다:
 *   1. template   — 어떤 ad template을 사용할지
 *   2. character  — 어떤 캐릭터/아웃핏/스타일로 렌더할지
 *   3. copy       — text_slot별 복사 텍스트
 *   4. product    — product_zone별 제품 이미지
 */

import { z } from "zod";

// ─── Character input ──────────────────────────────────────────────────────────

export const SceneCharacterInputSchema = z.object({
  characterId: z.uuid({ error: "characterId must be a valid UUID" }),
  /** 아웃핏 ID. 없으면 캐릭터 기본 아웃핏 사용 */
  outfitId: z.string().optional(),
  styleOverrides: z
    .object({
      /** 0–1: 표정 강도 */
      expressionIntensity: z.number().min(0).max(1).optional(),
      /** 0–1: 뷰티 필터 강도 */
      beautyStrength: z.number().min(0).max(1).optional(),
      /** 0–1: 카메라 에너지 (움직임 강도) */
      cameraEnergy: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

// ─── Background input ─────────────────────────────────────────────────────────

export const SceneBackgroundInputSchema = z.object({
  /**
   * template_hint: 템플릿이 제안하는 배경(audio_hint_key) 또는 자동 생성.
   * custom: 사용자가 직접 배경 ID 지정.
   * auto: 시스템이 template category + character에 맞게 자동 선택.
   */
  mode: z.enum(["template_hint", "custom", "auto"]).default("auto"),
  /** mode=custom 일 때 필수: background asset ID or R2 key */
  customBackgroundId: z.string().optional(),
  /** 배경 분위기 재정의 (mode=auto일 때 힌트로 사용) */
  styleHint: z
    .object({
      sceneType: z.string().optional(),     // e.g. "studio", "street", "minimal"
      lightingProfile: z.string().optional(), // e.g. "soft_daylight", "dramatic"
      colorTemperature: z.enum(["warm", "cool", "neutral"]).optional(),
    })
    .optional(),
});

// ─── Copy input (text slots) ─────────────────────────────────────────────────

export const SceneCopyInputSchema = z
  .record(
    z.string().min(1).max(64), // slotId
    z.string().max(500)         // 실제 텍스트
  )
  .describe("{ [slotId]: text } — template.text_slots에 정의된 slotId 기준");

// ─── Product input (product zones) ───────────────────────────────────────────

export const SceneProductZoneInputSchema = z.object({
  /** R2 key 또는 공개 URL — 제품 이미지 */
  imageUrl: z.string().min(1),
  /**
   * 제품 이미지의 실제 가로세로 비율 (width / height).
   * 없으면 서버가 이미지 프로브로 결정.
   */
  aspectRatio: z.number().min(0.1).max(10).optional(),
  /** 제품 이미지가 투명 배경(PNG)인지 */
  hasTransparentBackground: z.boolean().default(false),
});

export const SceneProductInputSchema = z
  .record(
    z.string().min(1).max(64),   // zoneId
    SceneProductZoneInputSchema
  )
  .describe("{ [zoneId]: ProductZoneInput } — template.product_zones에 정의된 zoneId 기준");

// ─── Output options ───────────────────────────────────────────────────────────

export const SceneOutputOptionsSchema = z.object({
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  fps: z.number().min(1).max(60).optional(),
  generateThumbnail: z.boolean().default(true),
  generatePreviewClip: z.boolean().default(true),
});

// ─── Create scene render job ──────────────────────────────────────────────────

export const CreateSceneRenderJobSchema = z
  .object({
    /** 사용할 ad template ID (UUID) */
    templateId: z.uuid({ error: "templateId must be a valid UUID" }),
    character: SceneCharacterInputSchema,
    background: SceneBackgroundInputSchema.default({ mode: "auto" }),
    /** { [slotId]: text } — required 슬롯은 반드시 포함해야 함 (service에서 검증) */
    copy: SceneCopyInputSchema.default({}),
    /** { [zoneId]: ProductZoneInput } — product_zones가 있는 템플릿은 필요 */
    product: SceneProductInputSchema.default({}),
    outputOptions: SceneOutputOptionsSchema.default({ generateThumbnail: true, generatePreviewClip: true }),
    /** 클라이언트 중복 방지용 멱등성 키 */
    clientRequestId: z.string().max(128).optional(),
    /** 브랜드 프로필 기반 생성 시 연결할 generation_session ID */
    generationSessionId: z.string().uuid().optional(),
    /** SceneRender 생성 시점의 브랜드 프로필 스냅샷 (taste 병합 완료본) */
    brandProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
  });

// ─── Status query ─────────────────────────────────────────────────────────────

export const SceneRenderStatusQuerySchema = z.object({
  includeSnapshot: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateSceneRenderJobInput = z.infer<typeof CreateSceneRenderJobSchema>;
export type SceneCharacterInput = z.infer<typeof SceneCharacterInputSchema>;
export type SceneBackgroundInput = z.infer<typeof SceneBackgroundInputSchema>;
export type SceneCopyInput = z.infer<typeof SceneCopyInputSchema>;
export type SceneProductInput = z.infer<typeof SceneProductInputSchema>;
export type SceneOutputOptions = z.infer<typeof SceneOutputOptionsSchema>;
