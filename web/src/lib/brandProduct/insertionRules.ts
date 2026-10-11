/**
 * insertionRules.ts
 *
 * 제품별 합성 규칙 프리셋 처리.
 *
 * 흐름:
 *   1. 이미지 생성 시 product.insertion_rules 조회
 *   2. 전역 INSERTION_MODE_RULES[mode] 위에 제품 프리셋을 shallow merge
 *   3. 최종 InsertionModeRules 를 job_snapshot 에 포함
 *   4. product_composite worker 가 이 규칙으로 합성
 */

import type {
  InsertionMode,
  InsertionModeRules,
} from "@/lib/sceneCompose/product/product.types";
import { INSERTION_MODE_RULES } from "@/lib/sceneCompose/product/product.types";
import type { BrandProductRow } from "./brandProduct.types";

// ─── 제품 프리셋 타입 ─────────────────────────────────────────────────────────

export interface ProductInsertionRulesPreset {
  /** 이 제품에 기본으로 사용할 합성 모드 */
  preferredMode: InsertionMode;
  /** 이하 모두 선택 — null이면 전역값 유지 */
  maxWidthRatio?: number;
  maxHeightRatio?: number;
  applyDropShadow?: boolean;
  autoRemoveBackground?: boolean;
  defaultAnchor?: InsertionModeRules["defaultAnchor"];
  allowOverflow?: boolean;
  /** safe area 내부 여백 (px). worker가 renderWidth/Height 계산 시 차감 */
  padding?: number;
}

// ─── 전역 규칙 + 제품 프리셋 병합 ────────────────────────────────────────────

/**
 * 제품 insertion_rules(프리셋)이 있으면 전역 INSERTION_MODE_RULES 위에 덮어쓴다.
 * 프리셋이 없으면 전역 규칙을 그대로 반환.
 *
 * @param mode          실제 사용할 삽입 모드
 * @param productPreset products.insertion_rules (null 허용)
 * @returns             최종 InsertionModeRules
 */
export function resolveInsertionRules(
  mode: InsertionMode,
  productPreset: ProductInsertionRulesPreset | null | undefined,
): InsertionModeRules {
  const base = INSERTION_MODE_RULES[mode];
  if (!productPreset) return base;

  return {
    defaultAnchor: productPreset.defaultAnchor ?? base.defaultAnchor,
    maxWidthRatio: productPreset.maxWidthRatio ?? base.maxWidthRatio,
    maxHeightRatio: productPreset.maxHeightRatio ?? base.maxHeightRatio,
    applyDropShadow: productPreset.applyDropShadow ?? base.applyDropShadow,
    autoRemoveBackground:
      productPreset.autoRemoveBackground ?? base.autoRemoveBackground,
    allowOverflow: productPreset.allowOverflow ?? base.allowOverflow,
  };
}

/**
 * 제품 row 에서 사용할 삽입 모드를 결정한다.
 * insertion_rules.preferredMode > product.default_insertion_mode 순서.
 */
export function resolveInsertionMode(product: BrandProductRow): InsertionMode {
  const preset = product.insertion_rules as ProductInsertionRulesPreset | null;
  return (
    preset?.preferredMode ?? product.default_insertion_mode ?? "graphic_insert"
  );
}

/**
 * 제품 row 에서 최종 InsertionModeRules 를 한번에 반환한다.
 * 이미지 생성 + product_composite worker 양쪽에서 사용.
 */
export function resolveProductInsertionSpec(product: BrandProductRow): {
  mode: InsertionMode;
  rules: InsertionModeRules;
  padding: number;
} {
  const preset = product.insertion_rules as ProductInsertionRulesPreset | null;
  const mode = resolveInsertionMode(product);
  const rules = resolveInsertionRules(mode, preset);
  return {
    mode,
    rules,
    padding: preset?.padding ?? 0,
  };
}
