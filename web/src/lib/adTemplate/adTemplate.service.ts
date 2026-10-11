/**
 * adTemplate.service.ts — 비즈니스 로직 레이어.
 *
 * 역할:
 *  - Repository를 호출해 DB 작업 수행
 *  - 접근 제어 (approved 필터, admin vs public view)
 *  - asset key → public URL 변환 (snapshot 생성 시)
 *  - 없음: Zod 파싱, HTTP 처리 (→ controller 역할)
 */

import * as repo from "./adTemplate.repository";
import {
  rowToAdTemplateResponse,
  type AdTemplateResponse,
  type AdTemplateSnapshot,
  type ListAdTemplatesResponse,
} from "./adTemplate.types";
import type {
  RegisterAdTemplateInput,
  AdminUpdateAdTemplateInput,
  UpdateAdTemplateStatusInput,
  ListAdTemplatesQuery,
  AdminListAdTemplatesQuery,
  QualityMetaInput,
} from "./adTemplate.schema";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AdTemplateNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Ad template not found: ${identifier}`);
    this.name = "AdTemplateNotFoundError";
  }
}

export class AdTemplateDuplicateCodeError extends Error {
  constructor(code: string) {
    super(`Ad template with code '${code}' already exists`);
    this.name = "AdTemplateDuplicateCodeError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function keyToUrl(key: string | null): string | null {
  if (!key) return null;
  const r2Base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  return r2Base ? `${r2Base}/${key}` : key;
}

function buildDefaultQualityMeta(partial?: Partial<QualityMetaInput>): QualityMetaInput {
  return {
    qualityScore: null,
    poseQualityScore: null,
    faceQualityScore: null,
    lightingScore: null,
    usageCount: 0,
    avgRenderSuccessRate: null,
    knownIssues: [],
    ...partial,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAdTemplate(
  input: RegisterAdTemplateInput,
  createdByUserId: string | null = null
): Promise<AdTemplateResponse> {
  const qualityMeta = buildDefaultQualityMeta(input.qualityMeta);

  try {
    const row = await repo.createAdTemplate(input, qualityMeta, createdByUserId);
    return rowToAdTemplateResponse(row);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
      throw new AdTemplateDuplicateCodeError(input.templateCode);
    }
    throw err;
  }
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getAdTemplateById(
  id: string,
  opts: { adminView?: boolean } = {}
): Promise<AdTemplateResponse> {
  const row = await repo.findAdTemplateById(id);
  if (!row) throw new AdTemplateNotFoundError(id);
  if (!opts.adminView && row.status !== "approved") throw new AdTemplateNotFoundError(id);
  return rowToAdTemplateResponse(row);
}

// ─── Get by code ──────────────────────────────────────────────────────────────

export async function getAdTemplateByCode(
  code: string,
  opts: { adminView?: boolean } = {}
): Promise<AdTemplateResponse> {
  const row = await repo.findAdTemplateByCode(code);
  if (!row) throw new AdTemplateNotFoundError(code);
  if (!opts.adminView && row.status !== "approved") throw new AdTemplateNotFoundError(code);
  return rowToAdTemplateResponse(row);
}

// ─── Get snapshot (pipeline용) ────────────────────────────────────────────────

export async function getAdTemplateSnapshot(code: string): Promise<AdTemplateSnapshot> {
  const tpl = await getAdTemplateByCode(code); // throws if not approved
  return {
    templateId: tpl.id,
    templateCode: tpl.templateCode,
    category: tpl.category,
    shotType: tpl.shotType,
    durationSec: tpl.durationSec,
    fps: tpl.fps,
    frameCount: tpl.frameCount,
    width: tpl.width,
    height: tpl.height,
    poseDataUrl: keyToUrl(tpl.assets.poseDataKey),
    faceSignalUrl: keyToUrl(tpl.assets.faceSignalKey),
    footContactUrl: keyToUrl(tpl.assets.footContactKey),
    personBboxTimelineUrl: keyToUrl(tpl.assets.personBboxTimelineKey),
    audioHintUrl: keyToUrl(tpl.assets.audioHintKey),
    motionVideoUrl: keyToUrl(tpl.assets.proxyVideoKey),
    textSlots: tpl.textSlots,
    productZones: tpl.productZones,
    characterConstraints: tpl.characterConstraints,
    transitionConfig: tpl.transitionConfig,
    brandFitTags: tpl.brandFitTags,
    templateVersion: tpl.templateVersion,
  };
}

// ─── List (public) ────────────────────────────────────────────────────────────

export async function listAdTemplates(
  query: ListAdTemplatesQuery
): Promise<ListAdTemplatesResponse> {
  const { rows, total } = await repo.findAdTemplates({
    status: "approved",
    category: query.category,
    shotType: query.shotType,
    brandFitTags: query.brandFitTags,
    isPremium: query.isPremium,
    limit: query.limit,
    offset: query.offset,
  });

  return {
    templates: rows.map(rowToAdTemplateResponse),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

// ─── List (admin) ─────────────────────────────────────────────────────────────

export async function adminListAdTemplates(
  query: AdminListAdTemplatesQuery
): Promise<ListAdTemplatesResponse> {
  const { rows, total } = await repo.findAdTemplates({
    status: query.status,           // undefined = all statuses
    category: query.category,
    shotType: query.shotType,
    brandFitTags: query.brandFitTags,
    isPremium: query.isPremium,
    limit: query.limit,
    offset: query.offset,
  });

  return {
    templates: rows.map(rowToAdTemplateResponse),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

// ─── Update status (admin) ────────────────────────────────────────────────────

export async function updateAdTemplateStatus(
  id: string,
  input: UpdateAdTemplateStatusInput,
  approvedByUserId: string | null = null
): Promise<AdTemplateResponse> {
  const row = await repo.updateAdTemplateStatus(
    id,
    input.status,
    input.rejectionReason ?? null,
    approvedByUserId
  );
  if (!row) throw new AdTemplateNotFoundError(id);
  return rowToAdTemplateResponse(row);
}

// ─── Full update (admin) ──────────────────────────────────────────────────────

export async function updateAdTemplate(
  id: string,
  input: AdminUpdateAdTemplateInput
): Promise<AdTemplateResponse> {
  // Fetch current row for merge (version bump, quality_meta merge)
  const current = await repo.findAdTemplateById(id);
  if (!current) throw new AdTemplateNotFoundError(id);

  const row = await repo.updateAdTemplate(id, input, current);
  if (!row) throw new AdTemplateNotFoundError(id);
  return rowToAdTemplateResponse(row);
}

// ─── Increment usage (called by render pipeline) ──────────────────────────────

export async function incrementTemplateUsage(id: string): Promise<void> {
  await repo.incrementUsageCount(id);
}
