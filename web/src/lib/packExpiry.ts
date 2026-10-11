/**
 * 이미지 장수 팩 — TTL 정책.
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 0.
 *   1장   → 30일 (Free tier 와 동일한 단기 사용 가정)
 *   10장  → 6개월
 *
 * 만료된 팩은 consume_from_pack RPC 의 WHERE expires_at > now() 조건으로
 * 자동 제외된다 (별도 cron 필요 없음). 잔량은 archive 목적으로 유지.
 */

import type { PackSize } from '@/lib/packPricing';

const DAY_MS = 24 * 60 * 60 * 1000;

const PACK_TTL_DAYS: Record<PackSize, number> = {
  1: 30,
  10: 180, // 6개월 ≈ 30 * 6
};

/**
 * 구매 시점(또는 `from` 인자) 기준 만료 시각.
 * 호출자가 시각을 고정하고 싶을 때 `from` 을 주입할 수 있도록 인자화.
 */
export function getPackExpiryFromSize(packSize: PackSize, from: Date = new Date()): Date {
  const days = PACK_TTL_DAYS[packSize];
  if (!days) {
    throw new Error(`unknown packSize for expiry: ${packSize}`);
  }
  return new Date(from.getTime() + days * DAY_MS);
}
