/**
 * sceneRender.orchestrator.ts — Scene render job 생성 + 큐 오케스트레이션.
 *
 * 역할:
 *  1. createSceneRenderJob   — 입력 검증 + snapshot 고정 + DB 레코드 생성 + 첫 스텝 큐
 *  2. enqueueSceneStep       — scene-worker edge function 호출
 *  3. getSceneRenderJobStatus — 상태 조회
 *  4. rowToResponse          — DB row → API response 변환
 *
 * 각 스텝별 비즈니스 로직은 /api/internal/scene-* 라우트에서 처리.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdTemplateSnapshot } from "@/lib/adTemplate/adTemplate.service";
import { AdTemplateNotFoundError } from "@/lib/adTemplate/adTemplate.service";
import { transitionSceneStage } from "./sceneRender.stage";
import { buildSceneAssetPaths } from "./sceneRender.paths";
import type { CreateSceneRenderJobInput } from "./sceneRender.schema";
import type {
  SceneJobSnapshot,
  SceneRenderQueueStep,
  SceneRenderJobResponse,
  CreateSceneRenderJobResponse,
  SceneAssetUrls,
  SceneOutputMetadata,
} from "./sceneRender.types";

const TABLE = "scene_render_jobs";

// ─── Business errors ──────────────────────────────────────────────────────────

export class SceneTemplateNotApprovedError extends Error {
  constructor(templateId: string) {
    super(`Template ${templateId} is not approved or does not exist`);
    this.name = "SceneTemplateNotApprovedError";
  }
}

export class SceneCopyValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super("Copy input validation failed");
    this.name = "SceneCopyValidationError";
  }
}

export class SceneJobNotFoundError extends Error {
  constructor(id: string) {
    super(`Scene render job not found: ${id}`);
    this.name = "SceneJobNotFoundError";
  }
}

// ─── Copy validation ───────────────────────────────────────────────────────────

function validateCopyInputs(
  copy: Record<string, string>,
  templateSnapshot: Awaited<ReturnType<typeof getAdTemplateSnapshot>>
): { resolved: Record<string, string>; errors: Record<string, string> } {
  const resolved: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const slot of templateSnapshot.textSlots) {
    const value = copy[slot.slotId];

    if (slot.required && !value?.trim()) {
      errors[`copy.${slot.slotId}`] = `Text slot '${slot.slotId}' (${slot.label}) is required`;
      continue;
    }

    const text = value ?? slot.defaultText ?? "";
    if (text.length > slot.maxChars) {
      // Truncate rather than error — maxChars is a soft constraint
      resolved[slot.slotId] = text.slice(0, slot.maxChars);
    } else {
      resolved[slot.slotId] = text;
    }
  }

  return { resolved, errors };
}

// ─── Create job ───────────────────────────────────────────────────────────────

export async function createSceneRenderJob(
  input: CreateSceneRenderJobInput,
  userId: string
): Promise<CreateSceneRenderJobResponse> {
  // ── 1. Load approved template snapshot ──────────────────────────────────
  const templateSnapshot = await getAdTemplateSnapshot(
    // getAdTemplateSnapshot accepts code; we need to load by ID first
    await _getTemplateCodeById(input.templateId)
  ).catch(() => {
    throw new SceneTemplateNotApprovedError(input.templateId);
  });

  if (!templateSnapshot) throw new SceneTemplateNotApprovedError(input.templateId);

  // ── 2. Validate + resolve copy inputs ────────────────────────────────────
  const { resolved: resolvedCopy, errors: copyErrors } = validateCopyInputs(
    input.copy,
    templateSnapshot
  );
  if (Object.keys(copyErrors).length > 0) {
    throw new SceneCopyValidationError(copyErrors);
  }

  // ── 3. Resolve output options (merge template defaults + user overrides) ──
  const outputOptions = {
    resolution: input.outputOptions.resolution ?? {
      width: templateSnapshot.width,
      height: templateSnapshot.height,
    },
    fps: input.outputOptions.fps ?? templateSnapshot.fps,
    generateThumbnail: input.outputOptions.generateThumbnail,
    generatePreviewClip: input.outputOptions.generatePreviewClip,
  };

  // ── 4. Build frozen snapshot ──────────────────────────────────────────────
  const jobSnapshot: SceneJobSnapshot = {
    templateSnapshot,
    characterInput: input.character,
    backgroundInput: input.background,
    resolvedCopy,
    resolvedProduct: input.product,
    outputOptions,
    frozenAt: new Date().toISOString(),
  };

  // ── 5. Idempotency check ──────────────────────────────────────────────────
  if (input.clientRequestId) {
    const existing = await _findByClientRequestId(userId, input.clientRequestId);
    if (existing) {
      return {
        sceneJobId: existing.id as string,
        status: "queued",
        currentStage: "scene_queued",
        templateCode: templateSnapshot.templateCode,
        category: templateSnapshot.category,
        estimatedSteps: _buildEstimatedSteps(templateSnapshot),
      };
    }
  }

  // ── 6. Create DB record ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      user_id: userId,
      template_id: input.templateId,
      template_code: templateSnapshot.templateCode,
      template_version: templateSnapshot.templateVersion,
      status: "queued",
      current_stage: "scene_queued",
      progress: 3,
      job_snapshot: jobSnapshot,
      client_request_id: input.clientRequestId ?? null,
      generation_session_id: input.generationSessionId ?? null,
      brand_profile_snapshot: input.brandProfileSnapshot ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) throw new Error(`createSceneRenderJob: DB insert failed — ${error.message}`);
  const sceneJobId = (data as { id: string }).id;

  // ── 7. Enqueue first step ─────────────────────────────────────────────────
  await enqueueSceneStep(sceneJobId, "scene_prepare");

  console.log(
    JSON.stringify({
      action: "scene_job_created",
      sceneJobId,
      templateCode: templateSnapshot.templateCode,
      userId,
    })
  );

  return {
    sceneJobId,
    status: "queued",
    currentStage: "scene_queued",
    templateCode: templateSnapshot.templateCode,
    category: templateSnapshot.category,
    estimatedSteps: _buildEstimatedSteps(templateSnapshot),
  };
}

// ─── Enqueue step ─────────────────────────────────────────────────────────────

export async function enqueueSceneStep(
  sceneJobId: string,
  step: SceneRenderQueueStep
): Promise<void> {
  const { error } = await supabaseAdmin.functions.invoke("scene-worker", {
    body: { scene_job_id: sceneJobId, step },
  });

  if (error) {
    console.error(
      JSON.stringify({
        action: "enqueueSceneStep_failed",
        sceneJobId,
        step,
        error: error.message,
      })
    );
    // Mark as failed if we can't even enqueue
    await transitionSceneStage(sceneJobId, "scene_failed", {
      errorCode: "SCENE_ENQUEUE_FAILED",
      errorMessage: `Failed to enqueue step ${step}: ${error.message}`,
    });
  }
}

// ─── Status query ─────────────────────────────────────────────────────────────

export async function getSceneRenderJobStatus(
  sceneJobId: string,
  includeSnapshot = false
): Promise<SceneRenderJobResponse> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", sceneJobId)
    .single();

  if (error?.code === "PGRST116") throw new SceneJobNotFoundError(sceneJobId);
  if (error) throw new Error(`getSceneRenderJobStatus: ${error.message}`);

  return rowToSceneJobResponse(data as Record<string, unknown>, includeSnapshot);
}

export async function getSceneRenderJobsByUser(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ jobs: SceneRenderJobResponse[]; total: number }> {
  const { data, count, error } = await supabaseAdmin
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`getSceneRenderJobsByUser: ${error.message}`);

  return {
    jobs: (data ?? []).map((r) => rowToSceneJobResponse(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}

// ─── Row → Response ───────────────────────────────────────────────────────────

export function rowToSceneJobResponse(
  row: Record<string, unknown>,
  includeSnapshot = false
): SceneRenderJobResponse {
  const assets: SceneAssetUrls = {
    bodyPassUrl:              (row.body_pass_url as string) ?? null,
    facePassUrl:              (row.face_pass_url as string) ?? null,
    fusedCharacterUrl:        (row.fused_character_url as string) ?? null,
    foregroundAlphaUrl:       (row.foreground_alpha_url as string) ?? null,
    draftCompositeUrl:        (row.draft_composite_url as string) ?? null,
    textOverlayUrl:           (row.text_overlay_url as string) ?? null,
    productCompositeUrl:      (row.product_composite_url as string) ?? null,
    polishedMasterUrl:        (row.polished_master_url as string) ?? null,
    finalSceneUrl:            (row.final_scene_url as string) ?? null,
    thumbnailUrl:             (row.thumbnail_url as string) ?? null,
    previewClipUrl:           (row.preview_clip_url as string) ?? null,
    sceneMetadataUrl:         (row.scene_metadata_url as string) ?? null,
  };

  const response: SceneRenderJobResponse = {
    sceneJobId:     row.id as string,
    status:         row.status as SceneRenderJobResponse["status"],
    currentStage:   row.current_stage as SceneRenderJobResponse["currentStage"],
    progress:       row.progress as number,
    templateId:     row.template_id as string,
    templateCode:   row.template_code as string,
    category:       (row.job_snapshot as SceneJobSnapshot)?.templateSnapshot?.category ?? "",
    assets,
    outputMetadata: (row.output_metadata as SceneOutputMetadata) ?? null,
    errorCode:      (row.error_code as string) ?? null,
    errorMessage:   (row.error_message as string) ?? null,
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
    completedAt:    (row.completed_at as string) ?? null,
  };

  if (includeSnapshot) {
    response.snapshot = row.job_snapshot as SceneJobSnapshot;
  }

  return response;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _getTemplateCodeById(templateId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("ad_templates")
    .select("template_code, status")
    .eq("id", templateId)
    .single();

  if (error?.code === "PGRST116") throw new AdTemplateNotFoundError(templateId);
  if (error) throw new Error(`_getTemplateCodeById: ${error.message}`);
  if ((data as Record<string, unknown>).status !== "approved") {
    throw new SceneTemplateNotApprovedError(templateId);
  }
  return (data as Record<string, unknown>).template_code as string;
}

async function _findByClientRequestId(
  userId: string,
  clientRequestId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin
    .from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("client_request_id", clientRequestId)
    .single();
  return (data as Record<string, unknown>) ?? null;
}

function _buildEstimatedSteps(
  templateSnapshot: Awaited<ReturnType<typeof getAdTemplateSnapshot>>
): SceneRenderQueueStep[] {
  const steps: SceneRenderQueueStep[] = [
    "scene_prepare",
    "scene_body_pass",
    "scene_face_pass",
    "scene_fusion",
    "scene_matting",
    "scene_composition",
  ];
  if (templateSnapshot.textSlots.length > 0) steps.push("scene_text_overlay");
  if (templateSnapshot.productZones.length > 0) steps.push("scene_product_composite");
  steps.push("scene_polish", "scene_encode");
  return steps;
}

export { buildSceneAssetPaths };
