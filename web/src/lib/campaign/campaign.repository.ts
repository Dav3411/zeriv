import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TABLE = "campaign_sequences";

// ─── Brand ownership check ────────────────────────────────────────────────────

/**
 * 해당 userId가 소유하거나 organization 멤버로 참여한 브랜드인지 확인한다.
 * 접근 가능하면 { id } 반환, 아니면 null.
 *
 * 권한 모델: brand는 organization에 속하고, organization_members로 접근 권한이 결정된다.
 * Legacy fallback으로 brands.user_id 직접 매칭도 지원 (마이그레이션 이전 데이터 방어).
 */
export async function dbGetBrand(
  brandId: string,
  userId: string,
): Promise<{ id: string } | null> {
  // 1) Legacy: brand의 직접 owner인가
  const { data: owned } = await supabaseAdmin
    .from("brands")
    .select("id, organization_id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (owned) return { id: (owned as { id: string }).id };

  // 2) brand의 organization을 조회해 해당 user가 멤버인지 확인
  const { data: brandRow } = await supabaseAdmin
    .from("brands")
    .select("id, organization_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brandRow || !brandRow.organization_id) {
    return null;
  }

  const { data: orgMembership } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", brandRow.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (orgMembership) return { id: brandId };

  return null;
}

export async function dbFindCampaignSequenceByAdJobId(
  adJobId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("id")
    .eq("ad_job_id", adJobId)
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw new Error(`campaignRepository.findByAdJobId: ${error.message}`);
  return data as { id: string };
}