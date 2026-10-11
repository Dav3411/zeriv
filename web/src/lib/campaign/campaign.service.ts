import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TABLE = "campaign_sequences";

// ─── Brand Memory ─────────────────────────────────────────────────────────────

export interface BrandMemory {
  defaultSequencePolicy: unknown | null;
  preferredCharacterPresets: Array<{ isDefault: boolean; characterId: string }>;
  preferredTemplateSet: unknown;
  brandRulesSnapshot: unknown | null;
}

/**
 * 브랜드의 메모리(기본 정책·프리셋·규칙)를 반환한다.
 * 아직 저장된 값이 없으면 빈 기본값을 반환해 호출부가 null-coalesce로 처리한다.
 */
export async function getBrandMemory(
  brandId: string,
  _userId: string,
): Promise<BrandMemory> {
  const { data } = await supabaseAdmin
    .from("brands")
    .select("brand_memory")
    .eq("id", brandId)
    .maybeSingle();

  const raw = (data as { brand_memory?: unknown } | null)?.brand_memory;
  if (!raw || typeof raw !== "object") {
    return {
      defaultSequencePolicy: null,
      preferredCharacterPresets: [],
      preferredTemplateSet: null,
      brandRulesSnapshot: null,
    };
  }

  const m = raw as Record<string, unknown>;
  return {
    defaultSequencePolicy: m.defaultSequencePolicy ?? null,
    preferredCharacterPresets: Array.isArray(m.preferredCharacterPresets)
      ? (m.preferredCharacterPresets as Array<{ isDefault: boolean; characterId: string }>)
      : [],
    preferredTemplateSet: m.preferredTemplateSet ?? null,
    brandRulesSnapshot: m.brandRulesSnapshot ?? null,
  };
}

export async function updateCampaignSequenceOutputSnapshot(
  campaignSequenceId: string,
  outputSnapshot: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({ output_snapshot: outputSnapshot })
    .eq("id", campaignSequenceId);

  if (error) throw new Error(`campaignService.updateOutputSnapshot: ${error.message}`);
}