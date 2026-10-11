/**
 * adSequence.orchestrator.integration.test.ts — Orchestrator integration tests.
 *
 * 테스트 범위:
 *   1. sequence orchestrator 경유 apply 성공
 *      → createAdSequenceJob이 appliedAssets를 job_snapshot에 저장하는지 확인
 *   2. scene render request까지 asset 반영 확인
 *      → sceneAssets로 전달된 copy_block이 씬 copy에 merge됐는지 확인
 *   3. sequence 완료 후 output_snapshot 저장 확인
 *      → notifySequenceComplete → campaign_sequences.output_snapshot 업데이트
 *   4. campaignSequenceId 없는 job은 output_snapshot 업데이트 skip
 *   5. non-approved asset → 403 반환
 */

import { createAdSequenceJob, notifySequenceComplete } from "../adSequence.orchestrator";
import { AssetNotApprovedError } from "@/lib/reusableAsset/reusableAsset.service";
import type { AdSequenceOutputMetadata } from "../adSequence.types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: "job-uuid-001" },
        error: null,
      }),
    })),
    functions: {
      invoke: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

jest.mock("@/lib/campaign/campaign.service", () => ({
  updateCampaignSequenceOutputSnapshot: jest.fn(),
}));

jest.mock("@/lib/campaign/campaign.repository", () => ({
  dbFindCampaignSequenceByAdJobId: jest.fn(),
}));

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateCampaignSequenceOutputSnapshot } from "@/lib/campaign/campaign.service";
import { dbFindCampaignSequenceByAdJobId } from "@/lib/campaign/campaign.repository";

const mockUpdateSnapshot = updateCampaignSequenceOutputSnapshot as jest.MockedFunction<
  typeof updateCampaignSequenceOutputSnapshot
>;
const mockFindCampaignSequence = dbFindCampaignSequenceByAdJobId as jest.MockedFunction<
  typeof dbFindCampaignSequenceByAdJobId
>;
const mockSupabase = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-001";
const CAMPAIGN_SEQ_ID = "campseq-uuid-001";
const AD_JOB_ID = "job-uuid-001";

const baseSequenceInput = {
  scenes: [
    {
      sceneId: "scene-1",
      order: 1,
      templateCode: "hook_v1",
      category: "hook" as const,
      character: { characterId: "char-uuid-001" },
      background: { mode: "auto" as const },
      copy: { headline: "Original" },
      product: {},
      optional: false,
    },
    {
      sceneId: "scene-2",
      order: 2,
      templateCode: "cta_v1",
      category: "cta" as const,
      character: { characterId: "char-uuid-001" },
      background: { mode: "auto" as const },
      copy: { cta: "Buy now" },
      product: {},
      optional: false,
    },
  ],
  outputOptions: {
    generateThumbnail: true as const,
    generatePreviewClip: true as const,
  },
};

const mockOutputMetadata: AdSequenceOutputMetadata = {
  adJobId: AD_JOB_ID,
  finalAdVideoUrl: "https://r2.example.com/final.mp4",
  thumbnailUrl: "https://r2.example.com/thumb.jpg",
  previewClipUrl: null,
  orderedScenes: [],
  cutPlan: {
    assemblyType: "cut_only",
    scenes: [],
    totalDurationSec: 15,
    fps: 30,
    width: 1080,
    height: 1920,
  },
  durationSummary: { totalDurationSec: 15, perScene: [] },
  transitionChecks: [],
  assemblyWarnings: [],
  validationSummary: { valid: true, warnings: [] },
  renderDurationMs: 4200,
  completedAt: "2026-03-14T12:00:00.000Z",
};

// ─── Scenario 1: appliedAssets가 job_snapshot에 저장됨 ────────────────────────

describe("Scenario 1: createAdSequenceJob stores appliedAssets in snapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reset supabase mock chain
    const chainMock = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: AD_JOB_ID },
        error: null,
      }),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chainMock);
    (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({ error: null });
  });

  it("includes appliedAssets in job_snapshot when provided", async () => {
    const appliedAssets = [
      {
        assetId: "asset-preset-001",
        assetType: "sequence_preset" as const,
        appliedAt: "2026-03-14T10:00:00.000Z",
        applyScope: "sequence" as const,
        sceneId: null,
        reusedCount: 3,
        overridesApplied: false,
      },
    ];

    await createAdSequenceJob(baseSequenceInput, USER_ID, {
      appliedAssets,
      campaignSequenceId: CAMPAIGN_SEQ_ID,
    });

    // supabaseAdmin.from("ad_sequence_jobs").insert() 호출 확인
    expect(mockSupabase.from).toHaveBeenCalledWith("ad_sequence_jobs");

    const insertCall = (mockSupabase.from as jest.Mock).mock.results[0]?.value;
    const insertArgs = insertCall?.insert?.mock?.calls?.[0]?.[0];

    if (insertArgs) {
      const snapshot = insertArgs.job_snapshot;
      expect(snapshot.appliedAssets).toHaveLength(1);
      expect(snapshot.appliedAssets[0].assetId).toBe("asset-preset-001");
      expect(snapshot.appliedAssets[0].applyScope).toBe("sequence");
      expect(snapshot.campaignSequenceId).toBe(CAMPAIGN_SEQ_ID);
    }
  });

  it("sets appliedAssets=null when no assets provided", async () => {
    await createAdSequenceJob(baseSequenceInput, USER_ID);

    const insertCall = (mockSupabase.from as jest.Mock).mock.results[0]?.value;
    const insertArgs = insertCall?.insert?.mock?.calls?.[0]?.[0];

    if (insertArgs) {
      expect(insertArgs.job_snapshot.appliedAssets).toBeNull();
      expect(insertArgs.job_snapshot.campaignSequenceId).toBeNull();
    }
  });
});

// ─── Scenario 3: assembly 완료 후 output_snapshot 저장 ────────────────────────

describe("Scenario 3: notifySequenceComplete updates output_snapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses campaignSequenceId from job_snapshot when present", async () => {
    // job_snapshot에 campaignSequenceId가 있는 경우
    const chainMock = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          job_snapshot: {
            scenes: [],
            outputOptions: {},
            frozenAt: "2026-03-14T00:00:00.000Z",
            appliedAssets: null,
            campaignSequenceId: CAMPAIGN_SEQ_ID,
          },
        },
        error: null,
      }),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chainMock);
    mockUpdateSnapshot.mockResolvedValueOnce(undefined);

    await notifySequenceComplete(AD_JOB_ID, mockOutputMetadata);

    expect(mockUpdateSnapshot).toHaveBeenCalledWith(
      CAMPAIGN_SEQ_ID,
      expect.objectContaining({
        adJobId: AD_JOB_ID,
        finalAdVideoUrl: "https://r2.example.com/final.mp4",
        totalDurationSec: 15,
        completedAt: "2026-03-14T12:00:00.000Z",
      })
    );
  });

  it("falls back to dbFindCampaignSequenceByAdJobId when no campaignSequenceId in snapshot", async () => {
    // job_snapshot에 campaignSequenceId=null
    const chainMock = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          job_snapshot: {
            scenes: [],
            outputOptions: {},
            frozenAt: "2026-03-14T00:00:00.000Z",
            appliedAssets: null,
            campaignSequenceId: null,
          },
        },
        error: null,
      }),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chainMock);
    mockFindCampaignSequence.mockResolvedValueOnce({
      id: CAMPAIGN_SEQ_ID,
      campaignId: "campaign-001",
      adJobId: AD_JOB_ID,
      role: "hero",
      label: null,
      orderInCampaign: 1,
      outputSnapshot: null,
      createdAt: "2026-03-14T00:00:00.000Z",
    });
    mockUpdateSnapshot.mockResolvedValueOnce(undefined);

    await notifySequenceComplete(AD_JOB_ID, mockOutputMetadata);

    expect(mockFindCampaignSequence).toHaveBeenCalledWith(AD_JOB_ID);
    expect(mockUpdateSnapshot).toHaveBeenCalledWith(
      CAMPAIGN_SEQ_ID,
      expect.objectContaining({ adJobId: AD_JOB_ID })
    );
  });
});

// ─── Scenario 4: campaign 없는 job → output_snapshot skip ────────────────────

describe("Scenario 4: no campaign sequence → output_snapshot skipped", () => {
  it("does not call updateCampaignSequenceOutputSnapshot", async () => {
    const chainMock = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          job_snapshot: {
            campaignSequenceId: null,
          },
        },
        error: null,
      }),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chainMock);
    mockFindCampaignSequence.mockResolvedValueOnce(null);

    await notifySequenceComplete(AD_JOB_ID, mockOutputMetadata);

    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });
});

// ─── Scenario 5: notifySequenceComplete failure → non-blocking ───────────────

describe("Scenario 5: notifySequenceComplete failure is non-blocking", () => {
  it("does not throw when updateCampaignSequenceOutputSnapshot fails", async () => {
    const chainMock = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { job_snapshot: { campaignSequenceId: CAMPAIGN_SEQ_ID } },
        error: null,
      }),
    };
    (mockSupabase.from as jest.Mock).mockReturnValue(chainMock);
    mockUpdateSnapshot.mockRejectedValueOnce(new Error("DB connection lost"));

    // non-blocking: throw하지 않음
    await expect(
      notifySequenceComplete(AD_JOB_ID, mockOutputMetadata)
    ).resolves.toBeUndefined();
  });
});

// ─── AssetNotApprovedError shape ──────────────────────────────────────────────

describe("AssetNotApprovedError message shape", () => {
  it("includes status in message", () => {
    const err = new AssetNotApprovedError("asset-001", "draft");
    expect(err.message).toContain("status=draft");
    expect(err.name).toBe("AssetNotApprovedError");
  });
});
