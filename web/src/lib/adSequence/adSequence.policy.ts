/**
 * adSequence.policy.ts — Named sequence policy presets.
 *
 * SequencePolicy는 현재 requireEnding 하나지만,
 * 향후 minScenes / maxRetries / allowOptionalScenes 등이 추가될 예정.
 *
 * 사용법:
 *   import { POLICY, resolvePolicy } from "@/lib/adSequence/adSequence.policy";
 *   const policy = resolvePolicy("ad_delivery");
 *   const policy = resolvePolicy(brand.defaultSequencePolicy ?? "experimental");
 */

import type { SequencePolicy } from "./adSequence.types";

// ─── Named presets ─────────────────────────────────────────────────────────────

/**
 * experimental — 빠른 반복 테스트용.
 * - ending 필수 아님 (validation warning만 발생)
 * - 2-scene 최소 구성 허용
 */
const experimental: SequencePolicy = {
  requireEnding: false,
};

/**
 * ad_delivery — 실제 광고 소재 생성용.
 * - ending 필수 (ending 없으면 sequence_validation_failed)
 * - 프로덕션 품질 기준 적용
 */
const ad_delivery: SequencePolicy = {
  requireEnding: true,
};

export const POLICY = {
  experimental,
  ad_delivery,
} as const satisfies Record<string, SequencePolicy>;

export type PolicyName = keyof typeof POLICY;

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * 이름 또는 inline policy 객체를 SequencePolicy로 변환.
 *
 * @param input PolicyName 문자열 또는 SequencePolicy 객체.
 *              null/undefined이면 "experimental" 기본값 사용.
 */
export function resolvePolicy(
  input: PolicyName | SequencePolicy | null | undefined
): SequencePolicy {
  if (!input) return experimental;
  if (typeof input === "string") return POLICY[input] ?? experimental;
  return input;
}

/**
 * SequencePolicy가 주어진 시퀀스 spec에 대해 유효한지 검사.
 * validation 오류 코드 목록 반환 (empty = 통과).
 */
export function checkPolicyViolations(
  scenes: { category: string }[],
  policy: SequencePolicy
): string[] {
  const violations: string[] = [];
  const hasEnding = scenes.some((s) => s.category === "ending");

  if (policy.requireEnding && !hasEnding) {
    violations.push("POLICY_ENDING_REQUIRED");
  }

  return violations;
}
