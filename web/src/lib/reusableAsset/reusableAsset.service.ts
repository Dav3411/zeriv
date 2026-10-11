/**
 * reusableAsset/reusableAsset.service.ts — Business logic layer.
 *
 * Apply 정책:
 *   status=approved 자산만 apply 허용. 그 외는 403.
 *
 * Lineage:
 *   자산 생성 시 lineage 레코드를 항상 함께 생성 (derivationType=original 기본값).
 */

import * as repo from "./reusableAsset.repository";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import type {
  ReusableAsset,
  AssetLineage,
  ApprovalRecord,
  AssetApplyResult,
} from "./reusableAsset.types";
import type {
  CreateReusableAssetInput,
  ApproveAssetInput,
} from "./reusableAsset.schema";
import { APPLY_ALLOWED_STATUSES } from "./reusableAsset.schema";

// ─── Domain errors ────────────────────────────────────────────────────────────

export class AssetNotFoundError extends Error {
  constructor(assetId: string) {
    super(`Reusable asset not found: ${assetId}`);
    this.name = "AssetNotFoundError";
  }
}

export class AssetNotApprovedError extends Error {
  constructor(assetId: string, status: string) {
    super(
      `Asset ${assetId} cannot be applied: status=${status}. ` +
      `Only approved assets can be applied.`
    );
    this.name = "AssetNotApprovedError";
  }
}

export class AssetAccessDeniedError extends Error {
  constructor(assetId: string) {
    super(`Access denied to asset: ${assetId}`);
    this.name = "AssetAccessDeniedError";
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * 자산 저장 + lineage 생성 (원자적 동작 보장은 없음 — lineage 실패 시 로그만 남김).
 */
export async function createReusableAsset(
  input: CreateReusableAssetInput,
  userId: string
): Promise<ReusableAsset> {
  // 브랜드 소유권 확인
  const brand = await dbGetBrand(input.brandId, userId);
  if (!brand) throw new AssetAccessDeniedError("brandId:" + input.brandId);

  const asset = await repo.dbCreateReusableAsset(input);

  // lineage 생성 — 실패해도 자산 생성은 롤백하지 않음 (non-blocking)
  try {
    await repo.dbCreateAssetLineage(asset.id, {
      sourceAssetId: null,
      sourceSceneJobId: input.sourceSceneRenderJobId,
      sourceAdJobId: input.sourceAdJobId,
      sourceCampaignId: null,
      templateId: null,
      templateCode: null,
      characterRef: null,
      productRef: null,
      copyRef: null,
      endingProfile: null,
      derivationType: "original",
      derivationNote: null,
    });
  } catch (err) {
    console.error(
      JSON.stringify({ action: "create_lineage_failed", assetId: asset.id, error: String(err) })
    );
  }

  return asset;
}

// ─── Get / List ───────────────────────────────────────────────────────────────

export async function getReusableAsset(
  assetId: string,
  userId: string
): Promise<{ asset: ReusableAsset; lineage: AssetLineage | null }> {
  const asset = await repo.dbGetReusableAsset(assetId);
  if (!asset) throw new AssetNotFoundError(assetId);

  // 소유권 확인
  await assertBrandOwnership(asset.brandId, userId, assetId);

  const lineage = await repo.dbGetAssetLineage(assetId);
  return { asset, lineage };
}

export async function listReusableAssets(
  userId: string,
  opts: {
    brandId?: string;
    campaignId?: string;
    assetType?: string;
    status?: string;
    tags?: string[];
    limit: number;
    offset: number;
  }
): Promise<ReusableAsset[]> {
  // brandId가 없으면 조회 불가 (필수 필터)
  if (!opts.brandId && !opts.campaignId) {
    throw new Error("brandId or campaignId is required for listing assets");
  }

  // 소유권 확인
  if (opts.brandId) {
    const brand = await dbGetBrand(opts.brandId, userId);
    if (!brand) throw new AssetAccessDeniedError("brandId:" + opts.brandId);
  }

  return repo.dbListReusableAssets(opts);
}

// ─── Approve / Reject ─────────────────────────────────────────────────────────

export async function approveOrRejectAsset(
  assetId: string,
  reviewerId: string,
  input: ApproveAssetInput
): Promise<{ asset: ReusableAsset; record: ApprovalRecord }> {
  const asset = await repo.dbGetReusableAsset(assetId);
  if (!asset) throw new AssetNotFoundError(assetId);

  // 소유권 확인
  await assertBrandOwnership(asset.brandId, reviewerId, assetId);

  // status 결정: approved / rejected (revision_requested는 status 변경 없음)
  let newStatus = asset.status;
  if (input.action === "approved") newStatus = "approved";
  else if (input.action === "rejected") newStatus = "rejected";
  // revision_requested: status = draft로 되돌림
  else if (input.action === "revision_requested") newStatus = "draft";

  const updatedAsset = await repo.dbUpdateReusableAssetStatus(
    assetId,
    newStatus,
    input.action === "approved" ? reviewerId : undefined,
    input.action === "approved" ? input.note : undefined
  );

  if (!updatedAsset) throw new AssetNotFoundError(assetId);

  const record = await repo.dbCreateApprovalRecord(
    assetId,
    reviewerId,
    input.action,
    input.note ?? null
  );

  return { asset: updatedAsset, record };
}

// ─── Apply ────────────────────────────────────────────────────────────────────

/**
 * 자산 apply — status=approved인 자산만 허용.
 * reusedCount를 원자적으로 증가시키고 payload를 반환.
 */
export async function applyReusableAsset(
  assetId: string,
  userId: string
): Promise<AssetApplyResult> {
  const asset = await repo.dbGetReusableAsset(assetId);
  if (!asset) throw new AssetNotFoundError(assetId);

  // 소유권 확인
  await assertBrandOwnership(asset.brandId, userId, assetId);

  // apply 정책: approved 자산만 허용
  if (!APPLY_ALLOWED_STATUSES.includes(asset.status)) {
    throw new AssetNotApprovedError(assetId, asset.status);
  }

  const newReusedCount = await repo.dbIncrementReusedCount(assetId);

  return {
    assetId: asset.id,
    assetType: asset.assetType,
    payload: asset.payload,
    reusedCount: newReusedCount,
    appliedAt: new Date().toISOString(),
  };
}

// ─── Lineage ──────────────────────────────────────────────────────────────────

export async function getAssetLineage(
  assetId: string,
  userId: string
): Promise<AssetLineage | null> {
  const asset = await repo.dbGetReusableAsset(assetId);
  if (!asset) throw new AssetNotFoundError(assetId);

  await assertBrandOwnership(asset.brandId, userId, assetId);

  return repo.dbGetAssetLineage(assetId);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function assertBrandOwnership(
  brandId: string,
  userId: string,
  context: string
): Promise<void> {
  const brand = await dbGetBrand(brandId, userId);
  if (!brand) throw new AssetAccessDeniedError(context);
}
