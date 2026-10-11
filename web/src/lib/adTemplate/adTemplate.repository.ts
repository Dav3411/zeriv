/**
 * adTemplate.repository.ts — DB 접근 전담 레이어.
 *
 * - Supabase 쿼리를 이 파일에만 격리한다.
 * - Service는 DB 쿼리 문법을 몰라도 된다.
 * - 반환값은 항상 raw DB row (DbAdTemplate) 또는 null.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  RegisterAdTemplateInput,
  AdminUpdateAdTemplateInput,
  QualityMetaInput,
} from "./adTemplate.schema";

// ─── DB row 타입 ──────────────────────────────────────────────────────────────

export interface DbAdTemplate {
  id: string;
  template_code: string;
  display_name: string;
  description: string;
  category: string;
  shot_type: string;
  status: string;
  template_version: number;
  rejection_reason: string | null;
  duration_sec: string | number;
  fps: string | number;
  frame_count: number;
  aspect_ratio: string;
  width: number;
  height: number;
  pose_data_key: string | null;
  face_signal_key: string | null;
  foot_contact_key: string | null;
  person_bbox_timeline_key: string | null;
  audio_hint_key: string | null;
  thumbnail_key: string | null;
  proxy_video_key: string | null;
  text_slots: unknown;
  product_zones: unknown;
  character_constraints: unknown;
  transition_config: unknown;
  brand_fit_tags: string[];
  quality_meta: unknown;
  is_premium: boolean;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Find filters ─────────────────────────────────────────────────────────────

export interface FindManyFilters {
  status?: string;
  category?: string;
  shotType?: string;
  brandFitTags?: string[];
  isPremium?: boolean;
  limit: number;
  offset: number;
}

export interface FindManyResult {
  rows: DbAdTemplate[];
  total: number;
}

const TABLE = "ad_templates";

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAdTemplate(
  input: RegisterAdTemplateInput,
  defaultQualityMeta: QualityMetaInput,
  createdByUserId: string | null
): Promise<DbAdTemplate> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      template_code: input.templateCode,
      display_name: input.displayName,
      description: input.description,
      category: input.category,
      shot_type: input.shotType,
      status: "draft",
      template_version: 1,
      duration_sec: input.durationSec,
      fps: input.fps,
      frame_count: input.frameCount,
      aspect_ratio: input.aspectRatio,
      width: input.width,
      height: input.height,
      pose_data_key: input.assets.poseDataKey ?? null,
      face_signal_key: input.assets.faceSignalKey ?? null,
      foot_contact_key: input.assets.footContactKey ?? null,
      person_bbox_timeline_key: input.assets.personBboxTimelineKey ?? null,
      audio_hint_key: input.assets.audioHintKey ?? null,
      thumbnail_key: input.assets.thumbnailKey ?? null,
      proxy_video_key: input.assets.proxyVideoKey ?? null,
      text_slots: input.textSlots,
      product_zones: input.productZones,
      character_constraints: input.characterConstraints,
      transition_config: input.transitionConfig,
      brand_fit_tags: input.brandFitTags,
      quality_meta: defaultQualityMeta,
      is_premium: input.isPremium,
      created_by: createdByUserId,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(`adTemplateRepository.create: ${error.message}`);
  return data as DbAdTemplate;
}

// ─── Find by ID ───────────────────────────────────────────────────────────────

export async function findAdTemplateById(id: string): Promise<DbAdTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw new Error(`adTemplateRepository.findById: ${error.message}`);
  return data as DbAdTemplate;
}

// ─── Find by code ─────────────────────────────────────────────────────────────

export async function findAdTemplateByCode(code: string): Promise<DbAdTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("template_code", code)
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw new Error(`adTemplateRepository.findByCode: ${error.message}`);
  return data as DbAdTemplate;
}

// ─── Find many ────────────────────────────────────────────────────────────────

export async function findAdTemplates(filters: FindManyFilters): Promise<FindManyResult> {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.shotType) {
    query = query.eq("shot_type", filters.shotType);
  }
  if (filters.isPremium !== undefined) {
    query = query.eq("is_premium", filters.isPremium);
  }
  if (filters.brandFitTags && filters.brandFitTags.length > 0) {
    query = query.overlaps("brand_fit_tags", filters.brandFitTags);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`adTemplateRepository.findMany: ${error.message}`);
  return { rows: (data ?? []) as DbAdTemplate[], total: count ?? 0 };
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateAdTemplateStatus(
  id: string,
  status: string,
  rejectionReason: string | null,
  approvedByUserId: string | null
): Promise<DbAdTemplate | null> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    rejection_reason: rejectionReason,
    updated_at: now,
  };
  if (status === "approved") {
    patch.approved_at = now;
    patch.approved_by = approvedByUserId;
  }
  if (status === "deprecated") {
    patch.deprecated_at = now;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw new Error(`adTemplateRepository.updateStatus: ${error.message}`);
  return data as DbAdTemplate;
}

// ─── Admin full update ────────────────────────────────────────────────────────

export async function updateAdTemplate(
  id: string,
  input: AdminUpdateAdTemplateInput,
  currentRow: DbAdTemplate
): Promise<DbAdTemplate | null> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.shotType !== undefined) patch.shot_type = input.shotType;
  if (input.durationSec !== undefined) patch.duration_sec = input.durationSec;
  if (input.fps !== undefined) patch.fps = input.fps;
  if (input.frameCount !== undefined) patch.frame_count = input.frameCount;
  if (input.aspectRatio !== undefined) patch.aspect_ratio = input.aspectRatio;
  if (input.width !== undefined) patch.width = input.width;
  if (input.height !== undefined) patch.height = input.height;
  if (input.textSlots !== undefined) patch.text_slots = input.textSlots;
  if (input.productZones !== undefined) patch.product_zones = input.productZones;
  if (input.characterConstraints !== undefined) patch.character_constraints = input.characterConstraints;
  if (input.transitionConfig !== undefined) patch.transition_config = input.transitionConfig;
  if (input.brandFitTags !== undefined) patch.brand_fit_tags = input.brandFitTags;
  if (input.isPremium !== undefined) patch.is_premium = input.isPremium;

  // Merge assets (only override provided keys)
  if (input.assets) {
    if (input.assets.poseDataKey !== undefined) patch.pose_data_key = input.assets.poseDataKey;
    if (input.assets.faceSignalKey !== undefined) patch.face_signal_key = input.assets.faceSignalKey;
    if (input.assets.footContactKey !== undefined) patch.foot_contact_key = input.assets.footContactKey;
    if (input.assets.personBboxTimelineKey !== undefined) patch.person_bbox_timeline_key = input.assets.personBboxTimelineKey;
    if (input.assets.audioHintKey !== undefined) patch.audio_hint_key = input.assets.audioHintKey;
    if (input.assets.thumbnailKey !== undefined) patch.thumbnail_key = input.assets.thumbnailKey;
    if (input.assets.proxyVideoKey !== undefined) patch.proxy_video_key = input.assets.proxyVideoKey;
  }

  // Merge quality_meta (overlay, not replace)
  if (input.qualityMeta) {
    const existing = (currentRow.quality_meta as Record<string, unknown>) ?? {};
    patch.quality_meta = { ...existing, ...input.qualityMeta };
  }

  // Bump version on any content change
  patch.template_version = currentRow.template_version + 1;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw new Error(`adTemplateRepository.update: ${error.message}`);
  return data as DbAdTemplate;
}

// ─── Increment usage count ────────────────────────────────────────────────────

export async function incrementUsageCount(id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_ad_template_usage", {
    template_id: id,
  });
  // Non-fatal — pipeline should not fail if stats update fails
  if (error) {
    console.warn(
      JSON.stringify({ action: "increment_usage_failed", id, error: error.message })
    );
  }
}
