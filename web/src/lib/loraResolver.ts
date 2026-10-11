/**
 * loraResolver.ts — LoRA stack resolver for outfit canonical generation
 *
 * 규칙:
 *  - identity LoRA는 거의 항상 유지 (character-specific)
 *  - outfit LoRA는 outfitSpec.styleTags 기반으로 선택적 추가
 *  - 총 LoRA 수 최대 3개
 *  - 전체 weight 합이 과하면 clipping
 */

// Types inlined (original modules removed)
interface LoraDefinition {
  loraId: string;
  url: string;
  defaultWeight: number;
  category: string;
  compatibleModes: string[];
}

interface ResolvedLoraItem {
  loraId: string;
  url: string;
  weight: number;
}

interface ResolvedModelStack {
  baseModelKey: string;
  baseModelUrl: string | null;
  resolvedLoraStack: ResolvedLoraItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// LoRA registry (추후 DB 테이블로 이전 가능)
// ─────────────────────────────────────────────────────────────────────────────

const LORA_REGISTRY: Record<string, LoraDefinition> = {
  outfit_detail_v2: {
    loraId: "outfit_detail_v2",
    url: process.env.LORA_OUTFIT_DETAIL_V2_URL ?? "",
    defaultWeight: 0.2,
    category: "outfit",
    compatibleModes: ["realistic", "25d"],
  },
  skin_soft_v3: {
    loraId: "skin_soft_v3",
    url: process.env.LORA_SKIN_SOFT_V3_URL ?? "",
    defaultWeight: 0.25,
    category: "style",
    compatibleModes: ["realistic"],
  },
  anime_style_v2: {
    loraId: "anime_style_v2",
    url: process.env.LORA_ANIME_STYLE_V2_URL ?? "",
    defaultWeight: 0.3,
    category: "style",
    compatibleModes: ["25d"],
  },
  fabric_detail_v1: {
    loraId: "fabric_detail_v1",
    url: process.env.LORA_FABRIC_DETAIL_V1_URL ?? "",
    defaultWeight: 0.15,
    category: "outfit",
    compatibleModes: ["realistic", "25d"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Base model URL mapping
// ─────────────────────────────────────────────────────────────────────────────

function resolveBaseModelUrl(
  _baseModelKey: string,
  _modeType: "realistic" | "25d",
): string | null {
  // instantIdPresets module removed — base model URL resolution disabled
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LoRA resolution
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LORAS = 3;
const MAX_TOTAL_WEIGHT = 1.5;

export function resolveLoraStack(opts: {
  modeType: "realistic" | "25d";
  baseModelKey: string;
  defaultLoraStack: Array<{ loraId: string; weight: number }>;
  outfitStyleTags?: string[];
}): ResolvedModelStack {
  const {
    modeType,
    baseModelKey,
    defaultLoraStack,
    outfitStyleTags = [],
  } = opts;

  // 1. Start with character's default LoRA stack (identity LoRAs)
  const resolved: ResolvedLoraItem[] = [];

  for (const item of defaultLoraStack) {
    const def = LORA_REGISTRY[item.loraId];
    if (!def) {
      // Unknown LoRA — skip silently (may be character-specific with direct URL)
      // If loraId looks like a URL, use it directly
      if (item.loraId.startsWith("http")) {
        resolved.push({
          loraId: item.loraId,
          url: item.loraId,
          weight: item.weight,
        });
      }
      continue;
    }
    if (!def.compatibleModes.includes(modeType)) continue;
    if (!def.url) continue; // URL not configured — skip

    resolved.push({ loraId: item.loraId, url: def.url, weight: item.weight });

    if (resolved.length >= MAX_LORAS) break;
  }

  // 2. Add outfit LoRA if slots remain and outfit warrants it
  const needsOutfitDetail =
    resolved.length < MAX_LORAS &&
    (outfitStyleTags.includes("leather") ||
      outfitStyleTags.includes("formal") ||
      outfitStyleTags.includes("bridal") ||
      outfitStyleTags.includes("traditional"));

  if (needsOutfitDetail) {
    const outfitLora = LORA_REGISTRY["outfit_detail_v2"];
    if (outfitLora?.url && outfitLora.compatibleModes.includes(modeType)) {
      const alreadyIncluded = resolved.some(
        (r) => r.loraId === "outfit_detail_v2",
      );
      if (!alreadyIncluded) {
        resolved.push({
          loraId: "outfit_detail_v2",
          url: outfitLora.url,
          weight: outfitLora.defaultWeight,
        });
      }
    }
  }

  // 3. Clip total weight if over threshold
  const totalWeight = resolved.reduce((s, r) => s + r.weight, 0);
  if (totalWeight > MAX_TOTAL_WEIGHT) {
    const scale = MAX_TOTAL_WEIGHT / totalWeight;
    for (const item of resolved) {
      item.weight = Math.round(item.weight * scale * 100) / 100;
    }
  }

  return {
    baseModelKey,
    baseModelUrl: resolveBaseModelUrl(baseModelKey, modeType),
    resolvedLoraStack: resolved,
  };
}
