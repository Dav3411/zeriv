/**
 * adSequence.validator.ts — Sequence 입력 유효성 검사.
 *
 * 규칙:
 *   [Hard fail → sequence_validation_failed]
 *   - 최소 2개, 최대 10개 scene
 *   - order 값이 1,2,...,N 연속 (gap 없음)
 *   - sceneId 중복 금지
 *   - hook category: 최대 1개, 있으면 order=1이어야 함
 *   - ending category: 최대 1개, 있으면 마지막이어야 함
 *   - ending 뒤에 다른 scene 불가
 *
 *   [Soft warning — 시퀀스 진행]
 *   - hook scene 없음
 *   - ending scene 없음
 *   - cta scene 없음
 *   - scene이 2개만
 *
 *   [Transition compatibility — v0.1: cut-only이므로 warning only]
 *   - shotType 불일치
 *   - static_hybrid(ending) 이후에 오는 scene
 */

import type { AdSceneSpec } from "./adSequence.schema";
import type {
  SequenceValidationResult,
  SequenceValidationWarning,
  SequenceValidationErrorCode,
  SequencePolicy,
  TransitionCheck,
  TransitionCompatibility,
} from "./adSequence.types";
import { DEFAULT_SEQUENCE_POLICY } from "./adSequence.types";

// ─── Category count limits ────────────────────────────────────────────────────

const MAX_CATEGORY_COUNT: Record<string, number> = {
  hook:         1,
  ending:       1,
  cta:          2,
  product_show: 3,
  benefit:      3,
  lifestyle:    3,
};

/**
 * cta 이후 등장 금지 category 목록.
 * cta 뒤에는 cta 자신 또는 ending만 허용.
 */
const INVALID_AFTER_CTA = new Set(["hook", "benefit", "lifestyle", "product_show"]);

// ─── Sequence validation ──────────────────────────────────────────────────────

export function validateAdSequence(
  scenes: AdSceneSpec[],
  policy: SequencePolicy = DEFAULT_SEQUENCE_POLICY
): SequenceValidationResult {
  const warnings: SequenceValidationWarning[] = [];
  const sorted = [...scenes].sort((a, b) => a.order - b.order);

  // ── 1. Count range
  if (scenes.length < 2) return fail("SEQ_TOO_FEW_SCENES", "Minimum 2 scenes required");
  if (scenes.length > 10) return fail("SEQ_TOO_MANY_SCENES", "Maximum 10 scenes allowed");

  // ── 2. Order contiguity
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].order !== i + 1) {
      return fail(
        "SEQ_ORDER_GAP",
        `Scene orders must be 1,2,...,N without gaps (expected ${i + 1}, got ${sorted[i].order})`
      );
    }
  }

  // ── 3. sceneId uniqueness
  const ids = sorted.map((s) => s.sceneId);
  if (new Set(ids).size !== ids.length) {
    return fail("SEQ_SCENE_ID_DUPLICATE", "Scene sceneIds must be unique");
  }

  // ── 4. Category counts
  const catCounts: Record<string, number> = {};
  for (const s of sorted) {
    catCounts[s.category] = (catCounts[s.category] ?? 0) + 1;
  }

  if ((catCounts["hook"] ?? 0) > 1) return fail("SEQ_DUPLICATE_HOOK", "At most 1 hook scene allowed");
  if ((catCounts["ending"] ?? 0) > 1) return fail("SEQ_DUPLICATE_ENDING", "At most 1 ending scene allowed");

  // ── 5. Position rules
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (catCounts["hook"] && first.category !== "hook") {
    return fail("SEQ_HOOK_NOT_FIRST", "Hook scene must be first (order=1)");
  }
  if (catCounts["ending"] && last.category !== "ending") {
    return fail("SEQ_ENDING_NOT_LAST", "Ending scene must be last");
  }

  // ── 6. No scene after ending (covered by ENDING_NOT_LAST, but explicit check for ordering)
  const endingIdx = sorted.findIndex((s) => s.category === "ending");
  if (endingIdx !== -1 && endingIdx !== sorted.length - 1) {
    return fail(
      "SEQ_INVALID_CATEGORY_ORDER",
      `Ending scene (sceneId=${sorted[endingIdx].sceneId}) must be last — no scenes allowed after it`
    );
  }

  // ── 7. CTA position: once a cta scene appears, only cta or ending may follow
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].category === "cta") {
      const next = sorted[i + 1];
      if (INVALID_AFTER_CTA.has(next.category)) {
        return fail(
          "SEQ_CTA_INVALID_POSITION",
          `CTA scene (sceneId=${sorted[i].sceneId}, order=${sorted[i].order}) cannot be followed by ` +
          `"${next.category}" scene (sceneId=${next.sceneId}, order=${next.order}). ` +
          `Only cta or ending may appear after the first cta.`
        );
      }
    }
  }

  // ── Warnings

  if (!catCounts["hook"])
    warnings.push({ code: "SEQ_NO_HOOK", message: "No hook scene — consider adding one for better retention" });

  // ending 없음: policy에 따라 hard fail 또는 warning
  if (!(catCounts["ending"] ?? 0)) {
    if (policy.requireEnding) {
      return fail(
        "SEQ_ENDING_REQUIRED",
        "Ending scene is required by sequence policy (policy.requireEnding=true)"
      );
    }
    warnings.push({ code: "SEQ_NO_ENDING", message: "No ending scene — consider adding a branded ending" });
  }

  if (!catCounts["cta"])
    warnings.push({ code: "SEQ_NO_CTA", message: "No CTA scene — consider adding a call-to-action" });

  if (scenes.length === 2)
    warnings.push({ code: "SEQ_ONLY_2_SCENES", message: "Short sequence (only 2 scenes)" });

  // ending 있는데 product_show 없음 — packshot/price ending일 가능성에 대한 경고
  // NOTE: ending profile이 packshot_offer_logo 또는 ending_packshot인데
  //       product zone asset이 없는 경우의 hard fail은 scene-level validation에서 처리한다.
  //       (template 로딩 이후 sequence-validate 라우트에서 검사)
  if ((catCounts["ending"] ?? 0) > 0 && !(catCounts["product_show"] ?? 0)) {
    warnings.push({
      code: "SEQ_NO_PRODUCT_SHOW_WITH_PRICE_ENDING",
      message:
        "Ending scene present but no product_show scene in sequence — " +
        "if the ending uses a packshot or offer profile, add a product_show scene for context",
    });
  }

  return { valid: true, warnings };
}

function fail(
  errorCode: SequenceValidationErrorCode,
  errorMessage: string
): SequenceValidationResult {
  return { valid: false, errorCode, errorMessage, warnings: [] };
}

// ─── Transition compatibility (v0.1 — cut-only, warning-only) ─────────────────

/**
 * 인접한 두 scene 간 shotType 호환성 검사.
 *
 * v0.1 규칙 (cut-only이므로 모든 불일치는 warning, hard_fail 없음):
 *   - same shotType → compatible
 *   - full_body ↔ upper_body → compatible (캐릭터 크기 변화 허용)
 *   - anything → static_hybrid → compatible (ending으로 자연스러운 전환)
 *   - product_aware ↔ full_body → warning (배경 주목도 전환)
 *   - static_hybrid → anything → hard_fail (ending 이후에 오는 scene은 이미 validator에서 막음)
 */
export function checkTransitionCompatibility(
  fromScene: { sceneId: string; shotType: string },
  toScene: { sceneId: string; shotType: string }
): TransitionCheck {
  const { sceneId: fromId, shotType: fromShot } = fromScene;
  const { sceneId: toId, shotType: toShot } = toScene;

  // ending → anything: should not happen (validator blocks it), but guard
  if (fromShot === "static_hybrid") {
    return {
      fromSceneId: fromId, toSceneId: toId,
      fromShotType: fromShot, toShotType: toShot,
      compatibility: "hard_fail",
      reason: "static_hybrid (ending) cannot have a scene after it",
    };
  }

  // same → compatible
  if (fromShot === toShot) {
    return compatible(fromId, toId, fromShot, toShot);
  }

  // full_body ↔ upper_body → compatible
  const bodyShots = new Set(["full_body", "upper_body"]);
  if (bodyShots.has(fromShot) && bodyShots.has(toShot)) {
    return compatible(fromId, toId, fromShot, toShot);
  }

  // anything → static_hybrid (ending) → compatible
  if (toShot === "static_hybrid") {
    return compatible(fromId, toId, fromShot, toShot);
  }

  // all other combinations → warning
  return {
    fromSceneId: fromId, toSceneId: toId,
    fromShotType: fromShot, toShotType: toShot,
    compatibility: "warning",
    reason: `ShotType transition ${fromShot}→${toShot} may be visually abrupt`,
  };
}

function compatible(
  fromId: string, toId: string,
  fromShot: string, toShot: string
): TransitionCheck {
  return {
    fromSceneId: fromId, toSceneId: toId,
    fromShotType: fromShot, toShotType: toShot,
    compatibility: "compatible", reason: null,
  };
}
