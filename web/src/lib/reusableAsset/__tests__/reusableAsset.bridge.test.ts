/**
 * reusableAsset.bridge.test.ts — Integration test scenarios.
 *
 * 테스트 범위:
 *   1. approved asset save → approve → apply flow
 *   2. scene request with copy_block applied
 *   3. scene request with scene_config applied + override
 *   4. sequence_preset applied with CTA scene override
 *   5. 403 on non-approved asset apply
 *
 * Mock 전략:
 *   - reusableAsset.service (applyReusableAsset) → jest.mock
 *   - campaign.service (getBrandMemory) → jest.mock
 *   - mergeSceneConfigWithOverrides / resolveBrandMemoryDefaults는 실제 구현 테스트
 */

import {
  applyReusableAssetToSceneRequest,
  applyReusableAssetToSequenceRequest,
  mergeSceneConfigWithOverrides,
  resolveBrandMemoryDefaults,
} from "../reusableAsset.bridge";
import { AssetNotApprovedError } from "../reusableAsset.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../reusableAsset.service", () => {
  const actual = jest.requireActual("../reusableAsset.service");
  return {
    ...actual,
    applyReusableAsset: jest.fn(),
  };
});

jest.mock("@/lib/campaign/campaign.service", () => ({
  getBrandMemory: jest.fn(),
}));

import { applyReusableAsset } from "../reusableAsset.service";
import { getBrandMemory } from "@/lib/campaign/campaign.service";

const mockApply = applyReusableAsset as jest.MockedFunction<typeof applyReusableAsset>;
const mockGetBrandMemory = getBrandMemory as jest.MockedFunction<typeof getBrandMemory>;

// ─── Test data ────────────────────────────────────────────────────────────────

const ASSET_ID = "asset-uuid-001";
const USER_ID = "user-uuid-001";
const BRAND_ID = "brand-uuid-001";

const baseSceneRequest = {
  templateId: "tmpl-uuid-000",
  character: { characterId: "char-uuid-base" },
  copy: { headline: "Original headline" },
  product: {},
  background: { mode: "auto" as const },
};

// ─── Scenario 1: approved asset save → approve → apply flow ──────────────────

describe("Scenario 1: approved asset apply flow", () => {
  it("applyReusableAsset service returns payload + incremented reusedCount", async () => {
    mockApply.mockResolvedValueOnce({
      assetId: ASSET_ID,
      assetType: "copy_block",
      payload: {
        type: "copy_block",
        templateCode: "hook_v1",
        category: "hook",
        slots: { headline: "Amazing product!", subtext: "Try it now" },
        language: "ko",
      },
      reusedCount: 1,
      appliedAt: "2026-03-14T00:00:00.000Z",
    });

    const result = await applyReusableAssetToSceneRequest(
      ASSET_ID,
      USER_ID,
      baseSceneRequest
    );

    expect(result.applyResult.reusedCount).toBe(1);
    expect(result.applyResult.assetType).toBe("copy_block");
    expect(result.endingInput).toBeNull();
  });
});

// ─── Scenario 2: copy_block applied to scene request ─────────────────────────

describe("Scenario 2: copy_block applied to scene request", () => {
  it("merges slots into base.copy, preserves other base fields", async () => {
    mockApply.mockResolvedValueOnce({
      assetId: ASSET_ID,
      assetType: "copy_block",
      payload: {
        type: "copy_block",
        templateCode: "hook_v1",
        category: "hook",
        slots: { headline: "From asset", subtext: "From asset sub" },
        language: "ko",
      },
      reusedCount: 2,
      appliedAt: "2026-03-14T00:00:00.000Z",
    });

    const result = await applyReusableAssetToSceneRequest(
      ASSET_ID,
      USER_ID,
      { ...baseSceneRequest, copy: { headline: "Original", keepThis: "yes" } }
    );

    // asset slots override base slots (headline replaced)
    expect(result.merged.copy?.["headline"]).toBe("From asset");
    expect(result.merged.copy?.["subtext"]).toBe("From asset sub");
    // base-only slot preserved
    expect(result.merged.copy?.["keepThis"]).toBe("yes");
    // character and other fields unchanged
    expect(result.merged.character?.characterId).toBe("char-uuid-base");
  });

  it("overrides layer on top of asset slots", async () => {
    mockApply.mockResolvedValueOnce({
      assetId: ASSET_ID,
      assetType: "copy_block",
      payload: {
        type: "copy_block",
        templateCode: null,
        category: null,
        slots: { headline: "Asset headline" },
        language: "ko",
      },
      reusedCount: 3,
      appliedAt: "2026-03-14T00:00:00.000Z",
    });

    const result = await applyReusableAssetToSceneRequest(
      ASSET_ID,
      USER_ID,
      baseSceneRequest,
      { copy: { headline: "Override wins" } }
    );

    // override가 asset보다 우선
    expect(result.merged.copy?.["headline"]).toBe("Override wins");
  });
});

// ─── Scenario 3: scene_config applied + override ─────────────────────────────

describe("Scenario 3: scene_config applied with override", () => {
  it("fills templateId, character, copy, product from payload; override wins on top", async () => {
    mockApply.mockResolvedValueOnce({
      assetId: ASSET_ID,
      assetType: "scene_config",
      payload: {
        type: "scene_config",
        templateCode: "hook_v1",
        templateId: "tmpl-uuid-hook",
        category: "hook",
        character: { characterId: "char-uuid-asset", outfitId: "outfit-01" },
        background: { mode: "template_hint" as const },
        copy: { headline: "Asset copy" },
        product: { mainZone: { imageUrl: "https://example.com/product.jpg", hasTransparentBackground: true } },
      },
      reusedCount: 1,
      appliedAt: "2026-03-14T00:00:00.000Z",
    });

    const result = await applyReusableAssetToSceneRequest(
      ASSET_ID,
      USER_ID,
      { ...baseSceneRequest },
      { character: { characterId: "char-uuid-override" } }
    );

    // templateId from payload
    expect(result.merged.templateId).toBe("tmpl-uuid-hook");
    // character override wins
    expect(result.merged.character?.characterId).toBe("char-uuid-override");
    // copy from payload
    expect(result.merged.copy?.["headline"]).toBe("Asset copy");
    // product from payload
    expect(result.merged.product?.["mainZone"]).toBeDefined();
  });
});

// ─── Scenario 4: sequence_preset applied with CTA scene override ──────────────

describe("Scenario 4: sequence_preset applied with scene override", () => {
  it("maps SequencePresetScene → AdSceneSpec, merges overrides by sceneId", async () => {
    mockApply.mockResolvedValueOnce({
      assetId: ASSET_ID,
      assetType: "sequence_preset",
      payload: {
        type: "sequence_preset",
        scenes: [
          {
            sceneId: "scene-1",
            order: 1,
            templateCode: "hook_v1",
            category: "hook",
            character: { characterId: "char-uuid-001" },
            background: { mode: "auto" as const },
            copy: { headline: "Hook copy" },
            product: {},
            optional: false,
            templateSnapshotVersion: 3,
            reusableAssetRefs: [],
          },
          {
            sceneId: "scene-cta",
            order: 2,
            templateCode: "cta_v1",
            category: "cta",
            character: { characterId: "char-uuid-001" },
            background: { mode: "auto" as const },
            copy: { cta: "원래 CTA" },
            product: {},
            optional: false,
            templateSnapshotVersion: 3,
            reusableAssetRefs: [],
          },
        ],
        outputOptions: { generateThumbnail: true, generatePreviewClip: true },
        validationSummary: null,
        sourceAdJobId: null,
        sequencePolicySnapshot: null,
      },
      reusedCount: 5,
      appliedAt: "2026-03-14T00:00:00.000Z",
    });

    const result = await applyReusableAssetToSequenceRequest(
      ASSET_ID,
      USER_ID,
      {},
      {
        scenes: [
          {
            sceneId: "scene-cta",
            order: 2,
            templateCode: "cta_v1",
            category: "cta",
            character: { characterId: "char-uuid-001" },
            background: { mode: "auto" as const },
            copy: { cta: "지금 구매하기" },
            product: {},
            optional: false,
          },
        ],
      }
    );

    const scenes = result.merged.scenes!;
    expect(scenes).toHaveLength(2);

    // scene-1은 preset 그대로
    expect(scenes[0].copy?.["headline"]).toBe("Hook copy");
    // scene-cta는 override copy 적용
    expect(scenes[1].copy?.["cta"]).toBe("지금 구매하기");

    // preset의 확장 필드(templateSnapshotVersion, reusableAssetRefs)는 제거됨
    expect((scenes[0] as Record<string, unknown>)["templateSnapshotVersion"]).toBeUndefined();
  });
});

// ─── Scenario 5: 403 on non-approved asset apply ─────────────────────────────

describe("Scenario 5: non-approved asset apply blocked", () => {
  it("throws AssetNotApprovedError for draft asset", async () => {
    mockApply.mockRejectedValueOnce(
      new AssetNotApprovedError(ASSET_ID, "draft")
    );

    await expect(
      applyReusableAssetToSceneRequest(ASSET_ID, USER_ID, baseSceneRequest)
    ).rejects.toThrow("cannot be applied");

    await expect(
      applyReusableAssetToSceneRequest(ASSET_ID, USER_ID, baseSceneRequest)
    ).rejects.toBeInstanceOf(Error);
  });

  it("throws AssetNotApprovedError for archived asset", async () => {
    mockApply.mockRejectedValueOnce(
      new AssetNotApprovedError(ASSET_ID, "archived")
    );

    await expect(
      applyReusableAssetToSceneRequest(ASSET_ID, USER_ID, baseSceneRequest)
    ).rejects.toThrow("status=archived");
  });
});

// ─── mergeSceneConfigWithOverrides unit test ──────────────────────────────────

describe("mergeSceneConfigWithOverrides", () => {
  it("deep merges copy slots", () => {
    const merged = mergeSceneConfigWithOverrides(
      { copy: { a: "base-a", b: "base-b" } },
      { copy: { b: "override-b", c: "new-c" } }
    );
    expect(merged.copy).toEqual({ a: "base-a", b: "override-b", c: "new-c" });
  });

  it("deep merges product zones", () => {
    const merged = mergeSceneConfigWithOverrides(
      { product: { z1: { imageUrl: "https://base.com/img.jpg", hasTransparentBackground: false } } },
      { product: { z2: { imageUrl: "https://override.com/img.jpg", hasTransparentBackground: true } } }
    );
    expect(merged.product?.["z1"]).toBeDefined();
    expect(merged.product?.["z2"]).toBeDefined();
  });

  it("override templateId wins", () => {
    const merged = mergeSceneConfigWithOverrides(
      { templateId: "base-tmpl" },
      { templateId: "override-tmpl" }
    );
    expect(merged.templateId).toBe("override-tmpl");
  });
});

// ─── resolveBrandMemoryDefaults unit test ─────────────────────────────────────

describe("resolveBrandMemoryDefaults", () => {
  it("returns DEFAULT_SEQUENCE_POLICY when no memory row", async () => {
    mockGetBrandMemory.mockResolvedValueOnce({
      brandId: BRAND_ID,
      approvedCopyBlocks: [],
      approvedEndingProfiles: [],
      preferredTemplateSet: [],
      preferredCharacterPresets: [],
      winningSequencePatterns: [],
      savedProductConfigs: [],
      brandRulesSnapshot: null,
      defaultSequencePolicy: null,
      extraMemory: null,
      updatedAt: "2026-03-14T00:00:00.000Z",
    });

    const defaults = await resolveBrandMemoryDefaults(BRAND_ID, USER_ID);
    expect(defaults.sequencePolicy.requireEnding).toBe(false);
    expect(defaults.defaultCharacterId).toBeNull();
  });

  it("returns custom policy when set in brand memory", async () => {
    mockGetBrandMemory.mockResolvedValueOnce({
      brandId: BRAND_ID,
      approvedCopyBlocks: [],
      approvedEndingProfiles: [],
      preferredTemplateSet: [
        { templateCode: "hook_v1", templateId: "tmpl-01", category: "hook", note: null, isDefault: true },
      ],
      preferredCharacterPresets: [
        { assetId: "asset-char-01", name: "Brand Model", characterId: "char-brand-01", outfit: "outfit-A", isDefault: true },
      ],
      winningSequencePatterns: [],
      savedProductConfigs: [],
      brandRulesSnapshot: { requireEnding: true, maxSceneCount: 6, allowedCategories: [], note: null, frozenAt: "2026-01-01T00:00:00.000Z" },
      defaultSequencePolicy: { requireEnding: true },
      extraMemory: null,
      updatedAt: "2026-03-14T00:00:00.000Z",
    });

    const defaults = await resolveBrandMemoryDefaults(BRAND_ID, USER_ID);
    expect(defaults.sequencePolicy.requireEnding).toBe(true);
    expect(defaults.defaultCharacterId).toBe("char-brand-01");
    expect(defaults.preferredTemplates).toHaveLength(1);
    expect(defaults.brandRules?.requireEnding).toBe(true);
  });
});
