/**
 * reusableAsset/reusableAsset.repository.ts — DB 접근 레이어.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  ReusableAsset,
  AssetLineage,
  ApprovalRecord,
  AssetApplyResult,
} from "./reusableAsset.types";
import type { CreateReusableAssetInput } from "./reusableAsset.schema";

// ─── ReusableAsset ─────────────────────────────────────────────────────────────

export async function dbCreateReusableAsset(
  input: CreateReusableAssetInput
): Promise<ReusableAsset> {
  const { data, error } = await supabaseAdmin
    .from("reusable_assets")
    .insert({
      brand_id: input.brandId,
      campaign_id: input.campaignId,
      asset_type: input.assetType,
      name: input.name,
      status: "draft",
      payload: input.payload,
      source_scene_render_job_id: input.sourceSceneRenderJobId,
      source_ad_job_id: input.sourceAdJobId,
      source_snapshot: input.sourceSnapshot,
      source_version: input.sourceVersion,
      tags: input.tags,
      use_cases: input.useCases,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create reusable asset: ${error?.message}`);
  return rowToReusableAsset(data as Record<string, unknown>);
}

export async function dbGetReusableAsset(assetId: string): Promise<ReusableAsset | null> {
  const { data, error } = await supabaseAdmin
    .from("reusable_assets")
    .select("*")
    .eq("id", assetId)
    .single();

  if (error || !data) return null;
  return rowToReusableAsset(data as Record<string, unknown>);
}

export async function dbListReusableAssets(opts: {
  brandId?: string;
  campaignId?: string;
  assetType?: string;
  status?: string;
  tags?: string[];
  limit: number;
  offset: number;
}): Promise<ReusableAsset[]> {
  let query = supabaseAdmin
    .from("reusable_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);

  if (opts.brandId) query = query.eq("brand_id", opts.brandId);
  if (opts.campaignId) query = query.eq("campaign_id", opts.campaignId);
  if (opts.assetType) query = query.eq("asset_type", opts.assetType);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.tags?.length) query = query.overlaps("tags", opts.tags);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list reusable assets: ${error.message}`);
  return (data ?? []).map((row) => rowToReusableAsset(row as Record<string, unknown>));
}

export async function dbUpdateReusableAssetStatus(
  assetId: string,
  status: string,
  approvedBy?: string,
  approvalNote?: string
): Promise<ReusableAsset | null> {
  const updates: Record<string, unknown> = { status };
  if (approvedBy) {
    updates.approved_by = approvedBy;
    updates.approval_note = approvalNote ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("reusable_assets")
    .update(updates)
    .eq("id", assetId)
    .select()
    .single();

  if (error || !data) return null;
  return rowToReusableAsset(data as Record<string, unknown>);
}

/**
 * reused_count를 원자적으로 1 증가.
 * increment_reused_count PostgreSQL 함수 사용 (campaign_v1_functions.sql 참고).
 */
export async function dbIncrementReusedCount(assetId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("increment_reused_count", {
    p_asset_id: assetId,
  });

  if (error) throw new Error(`Failed to increment reused_count: ${error.message}`);
  return (data as number) ?? 0;
}

// ─── Asset lineage ────────────────────────────────────────────────────────────

export async function dbCreateAssetLineage(
  assetId: string,
  lineage: Omit<AssetLineage, "id" | "assetId" | "createdAt">
): Promise<AssetLineage> {
  const { data, error } = await supabaseAdmin
    .from("asset_lineage")
    .insert({
      asset_id: assetId,
      source_asset_id: lineage.sourceAssetId,
      source_scene_job_id: lineage.sourceSceneJobId,
      source_ad_job_id: lineage.sourceAdJobId,
      source_campaign_id: lineage.sourceCampaignId,
      template_id: lineage.templateId,
      template_code: lineage.templateCode,
      character_ref: lineage.characterRef,
      product_ref: lineage.productRef,
      copy_ref: lineage.copyRef,
      ending_profile: lineage.endingProfile,
      derivation_type: lineage.derivationType,
      derivation_note: lineage.derivationNote,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create asset lineage: ${error?.message}`);
  return rowToAssetLineage(data as Record<string, unknown>);
}

export async function dbGetAssetLineage(assetId: string): Promise<AssetLineage | null> {
  const { data, error } = await supabaseAdmin
    .from("asset_lineage")
    .select("*")
    .eq("asset_id", assetId)
    .single();

  if (error || !data) return null;
  return rowToAssetLineage(data as Record<string, unknown>);
}

// ─── Approval record ──────────────────────────────────────────────────────────

export async function dbCreateApprovalRecord(
  assetId: string,
  reviewerId: string,
  action: string,
  note: string | null
): Promise<ApprovalRecord> {
  const { data, error } = await supabaseAdmin
    .from("approval_records")
    .insert({
      asset_id: assetId,
      reviewer_id: reviewerId,
      action,
      note,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create approval record: ${error?.message}`);
  return rowToApprovalRecord(data as Record<string, unknown>);
}

export async function dbGetApprovalHistory(assetId: string): Promise<ApprovalRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("approval_records")
    .select("*")
    .eq("asset_id", assetId)
    .order("reviewed_at", { ascending: false });

  if (error) throw new Error(`Failed to get approval history: ${error.message}`);
  return (data ?? []).map((row) => rowToApprovalRecord(row as Record<string, unknown>));
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function rowToReusableAsset(row: Record<string, unknown>): ReusableAsset {
  return {
    id: row.id as string,
    brandId: row.brand_id as string,
    campaignId: (row.campaign_id as string | null) ?? null,
    assetType: row.asset_type as ReusableAsset["assetType"],
    name: row.name as string,
    status: row.status as ReusableAsset["status"],
    payload: row.payload as ReusableAsset["payload"],
    sourceSceneRenderJobId: (row.source_scene_render_job_id as string | null) ?? null,
    sourceAdJobId: (row.source_ad_job_id as string | null) ?? null,
    sourceSnapshot: (row.source_snapshot as Record<string, unknown> | null) ?? null,
    sourceVersion: (row.source_version as string | null) ?? null,
    tags: (row.tags as string[]) ?? [],
    useCases: (row.use_cases as string[]) ?? [],
    approvedBy: (row.approved_by as string | null) ?? null,
    approvalNote: (row.approval_note as string | null) ?? null,
    reusedCount: (row.reused_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToAssetLineage(row: Record<string, unknown>): AssetLineage {
  return {
    id: row.id as string,
    assetId: row.asset_id as string,
    sourceAssetId: (row.source_asset_id as string | null) ?? null,
    sourceSceneJobId: (row.source_scene_job_id as string | null) ?? null,
    sourceAdJobId: (row.source_ad_job_id as string | null) ?? null,
    sourceCampaignId: (row.source_campaign_id as string | null) ?? null,
    templateId: (row.template_id as string | null) ?? null,
    templateCode: (row.template_code as string | null) ?? null,
    characterRef: (row.character_ref as AssetLineage["characterRef"]) ?? null,
    productRef: (row.product_ref as AssetLineage["productRef"]) ?? null,
    copyRef: (row.copy_ref as AssetLineage["copyRef"]) ?? null,
    endingProfile: (row.ending_profile as string | null) ?? null,
    derivationType: row.derivation_type as AssetLineage["derivationType"],
    derivationNote: (row.derivation_note as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function rowToApprovalRecord(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: row.id as string,
    assetId: row.asset_id as string,
    reviewerId: row.reviewer_id as string,
    action: row.action as ApprovalRecord["action"],
    note: (row.note as string | null) ?? null,
    reviewedAt: row.reviewed_at as string,
  };
}
