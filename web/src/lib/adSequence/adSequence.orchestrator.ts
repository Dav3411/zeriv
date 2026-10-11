/**
 * adSequence.orchestrator.ts — Ad sequence job 생성 + 상태 조회.
 *
 * 역할:
 *   - createAdSequenceJob: 입력 받아 DB insert + sequence_validate 큐 등록
 *   - enqueueSequenceStep: sequence-worker edge function 호출
 *   - getAdSequenceJobStatus: DB row → AdSequenceJobResponse 변환
 *   - checkAllScenesComplete: scene_collecting 단계에서 완료 여부 확인
 *
 * 각 스텝의 실제 처리 로직은 /api/internal/sequence-* 라우트에 있음:
 *   sequence_validate  → /api/internal/sequence-validate
 *   scene_jobs_create  → /api/internal/sequence-create-jobs
 *   sequence_collect   → /api/internal/sequence-collect
 *   sequence_assemble  → /api/internal/sequence-assemble
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { CreateAdSequenceJobInput } from "./adSequence.schema";
import type {
  AdSequenceJobSnapshot,
  AdSequenceJobResponse,
  CreateAdSequenceJobResponse,
  SceneJobRef,
  AdSequenceOutputMetadata,
  AppliedAssetRecord,
} from "./adSequence.types";
import { updateCampaignSequenceOutputSnapshot } from "@/lib/campaign/campaign.service";
import { dbFindCampaignSequenceByAdJobId } from "@/lib/campaign/campaign.repository";

// ─── Create job ───────────────────────────────────────────────────────────────

export async function createAdSequenceJob(
  input: CreateAdSequenceJobInput,
  userId: string,
  opts: {
    appliedAssets?: AppliedAssetRecord[];
    campaignSequenceId?: string;
  } = {}
): Promise<CreateAdSequenceJobResponse & { adJobId: string }> {
  const now = new Date().toISOString();
  const sortedScenes = [...input.scenes].sort((a, b) => a.order - b.order);

  const snapshot: AdSequenceJobSnapshot = {
    scenes: sortedScenes,
    outputOptions: {
      generateThumbnail: input.outputOptions.generateThumbnail ?? true,
      generatePreviewClip: input.outputOptions.generatePreviewClip ?? true,
      resolution: input.outputOptions.resolution,
      fps: input.outputOptions.fps,
      targetDurationSec: input.outputOptions.targetDurationSec,
    },
    frozenAt: now,
    appliedAssets: opts.appliedAssets?.length ? opts.appliedAssets : null,
    campaignSequenceId: opts.campaignSequenceId ?? null,
  };

  // Initial scene_job_refs — all pending
  const initialRefs: SceneJobRef[] = sortedScenes.map((s) => ({
    sceneId: s.sceneId,
    order: s.order,
    category: s.category,
    templateCode: s.templateCode,
    sceneJobId: null,
    status: "pending",
    outputMetadata: null,
    failureReason: null,
  }));

  // ── Idempotency check
  if (input.clientRequestId) {
    const { data: existing } = await supabaseAdmin
      .from("ad_sequence_jobs")
      .select("id, status, current_stage")
      .eq("user_id", userId)
      .eq("client_request_id", input.clientRequestId)
      .single();

    if (existing) {
      return {
        adJobId: (existing as Record<string, unknown>).id as string,
        status: "queued",
        currentStage: "sequence_queued",
        sceneCount: input.scenes.length,
      };
    }
  }

  // ── DB insert
  const { data: row, error } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .insert({
      user_id: userId,
      client_request_id: input.clientRequestId ?? null,
      status: "queued",
      current_stage: "sequence_queued",
      progress: 2,
      job_snapshot: snapshot,
      scene_job_refs: initialRefs,
      generation_session_id: input.generationSessionId ?? null,
      brand_profile_snapshot: input.brandProfileSnapshot ?? null,
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(`Failed to create ad_sequence_job: ${error?.message}`);
  }

  const adJobId = (row as Record<string, unknown>).id as string;

  // ── Enqueue first step
  await enqueueSequenceStep(adJobId, "sequence_validate");

  return {
    adJobId,
    status: "queued",
    currentStage: "sequence_queued",
    sceneCount: input.scenes.length,
  };
}

// ─── Enqueue step ─────────────────────────────────────────────────────────────

export async function enqueueSequenceStep(adJobId: string, step: string): Promise<void> {
  const { error } = await supabaseAdmin.functions.invoke("sequence-worker", {
    body: { ad_job_id: adJobId, step },
  });

  if (error) {
    console.error(
      JSON.stringify({ action: "enqueueSequenceStep_failed", adJobId, step, error: String(error) })
    );
    throw new Error(`Failed to enqueue sequence step ${step}: ${String(error)}`);
  }
}

// ─── Status check helpers ─────────────────────────────────────────────────────

/**
 * scene_collecting 단계에서 호출.
 * 모든 scene이 완료/skipped되었는지 확인.
 *
 * @returns "all_done" | "some_failed" | "still_pending"
 */
export function checkAllScenesComplete(refs: SceneJobRef[]): {
  result: "all_done" | "some_failed" | "still_pending";
  completedCount: number;
  totalCount: number;
  failedRequired: SceneJobRef[];
} {
  const totalCount = refs.length;
  const completedOrSkipped = refs.filter(
    (r) => r.status === "completed" || r.status === "skipped"
  );
  const failedRequired = refs.filter(
    (r) => r.status === "failed" // optional=true ones become "skipped", not "failed"
  );

  if (failedRequired.length > 0) {
    return {
      result: "some_failed",
      completedCount: completedOrSkipped.length,
      totalCount,
      failedRequired,
    };
  }

  if (completedOrSkipped.length === totalCount) {
    return {
      result: "all_done",
      completedCount: completedOrSkipped.length,
      totalCount,
      failedRequired: [],
    };
  }

  return {
    result: "still_pending",
    completedCount: completedOrSkipped.length,
    totalCount,
    failedRequired: [],
  };
}

// ─── Status query ─────────────────────────────────────────────────────────────

export async function getAdSequenceJobStatus(
  adJobId: string,
  userId: string
): Promise<AdSequenceJobResponse | null> {
  const { data: row, error } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .select("*")
    .eq("id", adJobId)
    .eq("user_id", userId)
    .single();

  if (error || !row) return null;
  return rowToAdSequenceJobResponse(row as Record<string, unknown>);
}

export function rowToAdSequenceJobResponse(row: Record<string, unknown>): AdSequenceJobResponse {
  return {
    adJobId: row.id as string,
    status: row.status as AdSequenceJobResponse["status"],
    currentStage: row.current_stage as AdSequenceJobResponse["currentStage"],
    progress: row.progress as number,
    sceneJobRefs: (row.scene_job_refs as SceneJobRef[]) ?? [],
    cutPlan: (row.cut_plan as AdSequenceJobResponse["cutPlan"]) ?? null,
    outputMetadata: (row.output_metadata as AdSequenceOutputMetadata | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

// ─── Assembly completion hook ─────────────────────────────────────────────────

/**
 * sequence assembly 완료 시 campaign_sequences.output_snapshot을 업데이트.
 *
 * 호출 시점: /api/internal/sequence-assemble 완료 직후 (assembly_completed 전환 전).
 *
 * 동작:
 *   1. ad_sequence_jobs.job_snapshot.campaignSequenceId 확인
 *   2. 없으면 campaign_sequences에서 ad_job_id 기준으로 조회 (legacy 지원)
 *   3. 찾은 campaignSequenceId로 output_snapshot 업데이트
 *
 * 실패 시 warn만 남기고 assembly 완료 흐름은 방해하지 않음 (non-blocking).
 */
export async function notifySequenceComplete(
  adJobId: string,
  outputMetadata: AdSequenceOutputMetadata
): Promise<void> {
  try {
    // job_snapshot에서 campaignSequenceId 조회
    const { data: jobRow } = await supabaseAdmin
      .from("ad_sequence_jobs")
      .select("job_snapshot")
      .eq("id", adJobId)
      .single();

    const snapshot = jobRow?.job_snapshot as AdSequenceJobSnapshot | null;
    let campaignSequenceId = snapshot?.campaignSequenceId ?? null;

    // snapshot에 없으면 campaign_sequences 테이블에서 ad_job_id 기준 조회
    if (!campaignSequenceId) {
      const seq = await dbFindCampaignSequenceByAdJobId(adJobId);
      campaignSequenceId = seq?.id ?? null;
    }

    if (!campaignSequenceId) return;

    const outputSnapshot: Record<string, unknown> = {
      adJobId,
      finalAdVideoUrl: outputMetadata.finalAdVideoUrl,
      thumbnailUrl: outputMetadata.thumbnailUrl,
      previewClipUrl: outputMetadata.previewClipUrl ?? null,
      totalDurationSec: outputMetadata.durationSummary.totalDurationSec,
      orderedScenes: outputMetadata.orderedScenes,
      cutPlan: outputMetadata.cutPlan,
      validationSummary: outputMetadata.validationSummary,
      assemblyWarnings: outputMetadata.assemblyWarnings,
      completedAt: outputMetadata.completedAt,
    };

    await updateCampaignSequenceOutputSnapshot(campaignSequenceId, outputSnapshot);
  } catch (err) {
    console.warn(
      JSON.stringify({
        action: "notifySequenceComplete_failed",
        adJobId,
        error: String(err),
      })
    );
  }
}
