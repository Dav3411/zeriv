/**
 * adSequence.schema.ts — Ad sequence job 입력 Zod 스키마.
 *
 * 여러 scene render job 결과를 순서대로 이어붙여 광고 숏폼 1개를 만드는 job의 입력.
 *
 * 입력 축:
 *   1. scenes  — 어떤 scene들을 어떤 순서로 조합할지 (각 scene → sceneRender job 1개)
 *   2. output  — 최종 영상 해상도/fps/썸네일 여부
 */

import { z } from "zod";
import {
  SceneCharacterInputSchema,
  SceneBackgroundInputSchema,
  SceneCopyInputSchema,
  SceneProductInputSchema,
} from "@/lib/sceneRender/sceneRender.schema";

// ─── Scene category ───────────────────────────────────────────────────────────

export const AdSceneCategorySchema = z.enum([
  "hook",
  "product_show",
  "benefit",
  "lifestyle",
  "cta",
  "ending",
]);

// ─── Scene spec ───────────────────────────────────────────────────────────────

export const AdSceneSpecSchema = z.object({
  /**
   * 클라이언트가 할당하는 stable ID.
   * 동일 시퀀스 내에서 유일해야 한다.
   * state tracking / error reporting에서 sceneJobId 대신 이 ID로 참조.
   */
  sceneId: z.string().min(1).max(64),
  /** 1-based 순서. 1,2,3,...,N 순서로 gap 없이 연속해야 함 */
  order: z.number().int().positive(),
  /** 사용할 ad template code (ad_templates.template_code) */
  templateCode: z.string().min(1).max(64),
  /**
   * 템플릿의 category와 일치해야 함.
   * 시퀀스 validation에서 사용 (DB 조회 없이 ordering rules 검사).
   */
  category: AdSceneCategorySchema,
  character: SceneCharacterInputSchema,
  background: SceneBackgroundInputSchema.default({ mode: "auto" }),
  copy: SceneCopyInputSchema.default({}),
  product: SceneProductInputSchema.default({}),
  /**
   * true: 이 씬 렌더가 실패해도 전체 시퀀스를 건너뛰고 계속 진행.
   * false: 실패 시 전체 시퀀스 실패.
   */
  optional: z.boolean().default(false),
});

// ─── Sequence output options ──────────────────────────────────────────────────

export const SequenceOutputOptionsSchema = z.object({
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  fps: z.number().min(1).max(60).optional(),
  generateThumbnail: z.boolean().default(true),
  generatePreviewClip: z.boolean().default(true),
  /**
   * 목표 총 길이 (초). v0.1에서는 hint만 — 강제하지 않음.
   * 실제 길이는 scene safeCutFrames 기반으로 결정됨.
   */
  targetDurationSec: z.number().min(5).max(120).optional(),
});

// ─── Create sequence job ──────────────────────────────────────────────────────

export const CreateAdSequenceJobSchema = z
  .object({
    scenes: z.array(AdSceneSpecSchema).min(2).max(10),
    outputOptions: SequenceOutputOptionsSchema.default({
      generateThumbnail: true,
      generatePreviewClip: true,
    }),
    /** 클라이언트 중복 방지용 멱등성 키 */
    clientRequestId: z.string().max(128).optional(),
    /** 브랜드 프로필 기반 생성 시 연결할 generation_session ID */
    generationSessionId: z.string().uuid().optional(),
    /** 숏폼 생성 시점의 브랜드 프로필 스냅샷 (taste 병합 완료본) */
    brandProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((val, ctx) => {
    // order must be 1,2,...,N without gaps
    const sorted = [...val.scenes].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].order !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Scene orders must be contiguous starting at 1 (expected ${i + 1}, got ${sorted[i].order})`,
        });
        return;
      }
    }
    // sceneId uniqueness
    const ids = new Set(val.scenes.map((s) => s.sceneId));
    if (ids.size !== val.scenes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scene sceneIds must be unique within a sequence",
      });
    }
  });

// ─── Status query ─────────────────────────────────────────────────────────────

export const AdSequenceStatusQuerySchema = z.object({
  includeSceneDetails: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateAdSequenceJobInput = z.infer<typeof CreateAdSequenceJobSchema>;
export type AdSceneSpec = z.infer<typeof AdSceneSpecSchema>;
export type AdSceneCategory = z.infer<typeof AdSceneCategorySchema>;
export type SequenceOutputOptions = z.infer<typeof SequenceOutputOptionsSchema>;
