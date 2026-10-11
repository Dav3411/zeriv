/**
 * PayPal customId 매핑 유틸리티.
 *
 * 신규 형식: paypal_orders.id 또는 paypal_subscriptions.id (DB row UUID, 외부에서 무의미)
 * Legacy 형식: "userId:planId" (영업 초기 진행 중인 결제 호환성 유지)
 *
 * fallback 순서:
 *   1. Legacy: "uuid:planId" 형식 → 직접 분리
 *   2. New: UUID → paypal_orders.id 조회 → 없으면 paypal_subscriptions.id 조회
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(.+)$/i;

export type CustomIdResolution = {
  userId: string;
  planId: string;
};

export async function resolveCustomIdToUserId(
  customId: string,
): Promise<CustomIdResolution | null> {
  if (!customId) return null;

  // Legacy: "userId:planId"
  const legacyMatch = LEGACY_RE.exec(customId);
  if (legacyMatch) {
    return { userId: legacyMatch[1], planId: legacyMatch[2] };
  }

  // New: bare UUID → DB lookup
  if (UUID_RE.test(customId)) {
    // paypal_orders.id 먼저 조회
    const { data: orderRow } = await supabaseAdmin
      .from("paypal_orders")
      .select("user_id, plan_id")
      .eq("id", customId)
      .maybeSingle();
    if (orderRow) {
      return { userId: orderRow.user_id as string, planId: orderRow.plan_id as string };
    }

    // paypal_subscriptions.id 조회 (구독 경로)
    const { data: subRow } = await supabaseAdmin
      .from("paypal_subscriptions")
      .select("user_id, plan_id")
      .eq("id", customId)
      .maybeSingle();
    if (subRow) {
      return { userId: subRow.user_id as string, planId: subRow.plan_id as string };
    }
  }

  return null;
}
