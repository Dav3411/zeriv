/**
 * sceneCompose/product/product.schema.ts — Product insertion Zod 스키마.
 */

import { z } from "zod";

export const InsertionModeSchema = z.enum([
  "none",
  "graphic_insert",
  "side_packshot",
  "ending_packshot",
  "handheld_supported", // TODO: 미구현
]);

export const ProductInsertionInputSchema = z.object({
  mode: InsertionModeSchema.default("graphic_insert"),
  /** zoneId — template.product_zones에 정의된 키 */
  zoneId: z.string().min(1).max(64),
  imageUrl: z.string().min(1),
  aspectRatio: z.number().min(0.1).max(10).optional(),
  hasTransparentBackground: z.boolean().default(false),
  /**
   * handheld_supported 요청 시 실제 구현 전까지 graphic_insert로 폴백할지.
   * 기본 true.
   */
  handheldFallbackToGraphic: z.boolean().default(true),
});

export type ProductInsertionInput = z.infer<typeof ProductInsertionInputSchema>;
