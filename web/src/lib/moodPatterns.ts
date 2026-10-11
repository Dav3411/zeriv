// Quick mode auto-match pattern catalog (TypeScript facade).
//
// Single source of truth lives in `web/scripts/quickPatterns.mjs` so the
// Node ESM worker (worker.mjs) and the Next.js client can share one dataset
// without duplication or drift. This file adds typed access for client/server
// TypeScript consumers; runtime data is identical.
//
// Mood pool invariants (DO NOT VIOLATE):
//   - Every scenePrompt describes ENVIRONMENT only — no people, no body
//     parts (hands, hair, skin, lips, fingers, etc.). The product itself
//     is composited by the downstream image generator.
//   - 35 entries total (7 categories × 5 mood patterns).
//   - Model-cut patterns will be appended later under format: "model".

// Imported from scripts/ via TypeScript's allowJs + moduleResolution: "bundler".
// JSDoc types in the .mjs are erased; we re-cast to the strict TypeScript shape below.
import { QUICK_PATTERNS as RAW_PATTERNS } from "../../scripts/quickPatterns.mjs";

export type CategoryKey =
  | "skincare"
  | "makeup"
  | "haircare"
  | "food"
  | "fashion"
  | "lifestyle"
  | "etc";

export type QuickFormat = "mood" | "model";

export type QuickPattern = {
  /** Unique snake_case identifier (stable, persisted in jobs.result). */
  key: string;
  category: CategoryKey;
  format: QuickFormat;
  /** Korean-facing label shown in the UI. */
  name: string;
  /** 5–8 short English keywords used as Vision-matcher hints. */
  visualHints: string[];
  /** 60–140 word English paragraph fed to buildProductScenePrompt as the user prompt. */
  scenePrompt: string;
};

export const QUICK_PATTERNS: readonly QuickPattern[] =
  RAW_PATTERNS as QuickPattern[];

/** Filter patterns by category and format. */
export function getPatternsFor(
  category: CategoryKey,
  format: QuickFormat,
): QuickPattern[] {
  return QUICK_PATTERNS.filter(
    (p) => p.category === category && p.format === format,
  );
}

/** Look up a single pattern by its stable key. */
export function getPatternByKey(key: string): QuickPattern | undefined {
  return QUICK_PATTERNS.find((p) => p.key === key);
}
