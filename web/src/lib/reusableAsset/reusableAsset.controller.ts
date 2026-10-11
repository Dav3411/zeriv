/**
 * reusableAsset/reusableAsset.controller.ts — HTTP 요청 파싱 + 응답 조립.
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  CreateReusableAssetSchema,
  ApproveAssetSchema,
  ListAssetsQuerySchema,
} from "./reusableAsset.schema";
import * as svc from "./reusableAsset.service";
import { dbGetApprovalHistory } from "./reusableAsset.repository";
import {
  AssetNotFoundError,
  AssetNotApprovedError,
  AssetAccessDeniedError,
} from "./reusableAsset.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spToObj(sp: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  sp.forEach((v, k) => { obj[k] = v; });
  return obj;
}

function zodErr(err: ZodError): NextResponse {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 422 });
}

function domainErr(err: unknown): NextResponse | null {
  if (err instanceof AssetNotFoundError)
    return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof AssetNotApprovedError)
    return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof AssetAccessDeniedError)
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return null;
}

async function parseBody(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
}

function log(action: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ action, ...extra }));
}
function logError(action: string, err: unknown): void {
  console.error(JSON.stringify({ action, error: String(err) }));
}

// ─── POST /api/reusable-assets ────────────────────────────────────────────────

export async function handleCreateReusableAsset(
  req: NextRequest,
  userId: string
): Promise<NextResponse> {
  const b = await parseBody(req);
  if (!b.ok) return b.res;

  const parsed = CreateReusableAssetSchema.safeParse(b.body);
  if (!parsed.success) return zodErr(parsed.error);

  try {
    const asset = await svc.createReusableAsset(parsed.data, userId);
    log("reusable_asset_created", {
      assetId: asset.id,
      assetType: asset.assetType,
      brandId: asset.brandId,
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return domainErr(err) ?? (
      logError("create_reusable_asset", err),
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

// ─── GET /api/reusable-assets ─────────────────────────────────────────────────

export async function handleListReusableAssets(
  req: NextRequest,
  userId: string
): Promise<NextResponse> {
  const parsed = ListAssetsQuerySchema.safeParse(spToObj(req.nextUrl.searchParams));
  if (!parsed.success) return zodErr(parsed.error);

  if (!parsed.data.brandId && !parsed.data.campaignId) {
    return NextResponse.json(
      { error: "brandId or campaignId query param is required" },
      { status: 400 }
    );
  }

  try {
    const assets = await svc.listReusableAssets(userId, parsed.data);
    return NextResponse.json({ assets, count: assets.length });
  } catch (err) {
    return domainErr(err) ?? (
      logError("list_reusable_assets", err),
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

// ─── GET /api/reusable-assets/[id] ───────────────────────────────────────────

export async function handleGetReusableAsset(
  assetId: string,
  userId: string
): Promise<NextResponse> {
  try {
    const [{ asset, lineage }, approvalHistory] = await Promise.all([
      svc.getReusableAsset(assetId, userId),
      dbGetApprovalHistory(assetId),
    ]);
    return NextResponse.json({ asset, lineage, approvalHistory });
  } catch (err) {
    return domainErr(err) ?? (
      logError("get_reusable_asset", err),
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

// ─── POST /api/reusable-assets/[id]/approve ──────────────────────────────────

export async function handleApproveAsset(
  req: NextRequest,
  assetId: string,
  userId: string
): Promise<NextResponse> {
  const b = await parseBody(req);
  if (!b.ok) return b.res;

  const parsed = ApproveAssetSchema.safeParse(b.body);
  if (!parsed.success) return zodErr(parsed.error);

  try {
    const { asset, record } = await svc.approveOrRejectAsset(assetId, userId, parsed.data);
    log("asset_approval_recorded", { assetId, action: record.action, status: asset.status });
    return NextResponse.json({ asset, approvalRecord: record });
  } catch (err) {
    return domainErr(err) ?? (
      logError("approve_asset", err),
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

// ─── POST /api/reusable-assets/[id]/apply ────────────────────────────────────

export async function handleApplyReusableAsset(
  assetId: string,
  userId: string
): Promise<NextResponse> {
  try {
    const result = await svc.applyReusableAsset(assetId, userId);
    log("asset_applied", { assetId, reusedCount: result.reusedCount });
    return NextResponse.json(result);
  } catch (err) {
    return domainErr(err) ?? (
      logError("apply_reusable_asset", err),
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

// ─── GET /api/reusable-assets/[id]/lineage ───────────────────────────────────

export async function handleGetAssetLineage(
  assetId: string,
  userId: string
): Promise<NextResponse> {
  try {
    const lineage = await svc.getAssetLineage(assetId, userId);
    return NextResponse.json({ assetId, lineage });
  } catch (err) {
    return domainErr(err) ?? (
      logError("get_asset_lineage", err),
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
