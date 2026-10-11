import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrgIdFromBrand } from "@/lib/organizationSubscription";

export type SignalType =
  | "download"
  | "feedback_positive"
  | "feedback_negative"
  | "style_reuse"
  | "variation_request";

export type SignalWeight = Record<SignalType, number>;

// 신호별 가중치 (Bayesian 학습 시 사용)
export const SIGNAL_WEIGHTS: SignalWeight = {
  download: 1.0,
  feedback_positive: 3.0,
  feedback_negative: -3.0,
  style_reuse: 2.0,
  variation_request: -0.5,
};

export async function recordSignal(params: {
  assetId: string;
  signalType: SignalType;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // asset → brand_id, organization_id 자동 lookup
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("brand_id")
    .eq("id", params.assetId)
    .maybeSingle();

  const brandId = (asset?.brand_id as string | null) ?? null;
  const orgId = brandId ? await getOrgIdFromBrand(brandId) : null;

  const weight = SIGNAL_WEIGHTS[params.signalType];

  // 피드백 신호는 같은 사용자의 기존 피드백을 먼저 삭제 후 insert (토글 효과)
  if (
    params.signalType === "feedback_positive" ||
    params.signalType === "feedback_negative"
  ) {
    if (params.userId) {
      await supabaseAdmin
        .from("creative_signals")
        .delete()
        .eq("asset_id", params.assetId)
        .eq("user_id", params.userId)
        .in("signal_type", ["feedback_positive", "feedback_negative"]);
    }
  }

  await supabaseAdmin.from("creative_signals").insert({
    asset_id: params.assetId,
    brand_id: brandId,
    organization_id: orgId,
    user_id: params.userId ?? null,
    signal_type: params.signalType,
    weight,
    metadata: params.metadata ?? null,
  });
}

/** 사용자가 이 asset에 이미 피드백을 남겼는지 조회 */
export async function getUserFeedback(
  assetId: string,
  userId: string,
): Promise<"positive" | "negative" | null> {
  const { data } = await supabaseAdmin
    .from("creative_signals")
    .select("signal_type")
    .eq("asset_id", assetId)
    .eq("user_id", userId)
    .in("signal_type", ["feedback_positive", "feedback_negative"])
    .maybeSingle();

  if (data?.signal_type === "feedback_positive") return "positive";
  if (data?.signal_type === "feedback_negative") return "negative";
  return null;
}

/**
 * 여러 asset의 사용자 피드백 상태를 한 번에 조회한다.
 * 반환값: assetId → "positive" | "negative" 맵 (피드백 없으면 키 없음)
 */
export async function getBatchUserFeedback(
  assetIds: string[],
  userId: string,
): Promise<Record<string, "positive" | "negative">> {
  if (assetIds.length === 0) return {};

  const { data } = await supabaseAdmin
    .from("creative_signals")
    .select("asset_id, signal_type")
    .in("asset_id", assetIds)
    .eq("user_id", userId)
    .in("signal_type", ["feedback_positive", "feedback_negative"]);

  const result: Record<string, "positive" | "negative"> = {};
  for (const row of data ?? []) {
    if (row.signal_type === "feedback_positive") {
      result[row.asset_id] = "positive";
    } else if (row.signal_type === "feedback_negative") {
      result[row.asset_id] = "negative";
    }
  }
  return result;
}
