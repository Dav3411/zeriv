/**
 * adSequence.sequenceCreateJobs.ts — /api/internal/sequence-create-jobs service.
 *
 * 역할:
 *   1. ad_sequence_jobs row 조회 + 단계 확인 (idempotency)
 *   2. 각 AdSceneSpec에 대해 templateCode → templateId 조회
 *   3. createSceneRenderJob 호출 → scene_render_jobs row 생성
 *   4. scene_job_refs 업데이트 + scene_collecting 전환
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSceneRenderJob } from "@/lib/sceneRender/sceneRender.orchestrator";
import { findAdTemplateByCode } from "@/lib/adTemplate/adTemplate.repository";
import { transitionSequenceStage } from "./adSequence.stage";
import { enqueueSequenceStep } from "./adSequence.orchestrator";
import type { AdSequenceJobSnapshot, SceneJobRef } from "./adSequence.types";
import type { AdSceneSpec } from "./adSequence.schema";

export interface SequenceCreateJobsResult {
  outcome: "created" | "skipped" | "failed";
  adJobId: string;
  sceneJobsCreated: number;
  errorMessage?: string;
}

export async function runSequenceCreateJobs(adJobId: string): Promise<SequenceCreateJobsResult> {
  // ── 1. Load job row
  const { data: row, error: fetchError } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .select("id, current_stage, user_id, job_snapshot, scene_job_refs")
    .eq("id", adJobId)
    .single();

  if (fetchError || !row) {
    throw new Error(`sequence-create-jobs: job not found (adJobId=${adJobId})`);
  }

  const r = row as Record<string, unknown>;
  const currentStage = r.current_stage as string;
  const userId = r.user_id as string;

  // ── 2. Idempotency — skip if already past this step
  if (currentStage !== "scene_jobs_creating") {
    return { outcome: "skipped", adJobId, sceneJobsCreated: 0 };
  }

  const snapshot = r.job_snapshot as AdSequenceJobSnapshot;
  const scenes: AdSceneSpec[] = snapshot?.scenes ?? [];
  const existingRefs = (r.scene_job_refs as SceneJobRef[]) ?? [];

  // Build a map of existing refs keyed by sceneId for idempotency
  const refMap = new Map<string, SceneJobRef>(existingRefs.map((ref) => [ref.sceneId, ref]));

  let sceneJobsCreated = 0;

  // ── 3. Create a scene render job for each scene
  for (const scene of scenes) {
    const existing = refMap.get(scene.sceneId);
    if (existing?.sceneJobId) {
      // Already created — skip
      continue;
    }

    // Mark as creating
    refMap.set(scene.sceneId, {
      ...(existing ?? {
        sceneId: scene.sceneId,
        order: scene.order,
        category: scene.category,
        templateCode: scene.templateCode,
        sceneJobId: null,
        status: "pending",
        outputMetadata: null,
        failureReason: null,
      }),
      status: "creating",
    });

    // Resolve templateCode → templateId
    const template = await findAdTemplateByCode(scene.templateCode);
    if (!template || template.status !== "approved") {
      await transitionSequenceStage(adJobId, "assembly_failed", {
        errorCode: "TEMPLATE_NOT_FOUND",
        errorMessage: `Template not found or not approved: ${scene.templateCode}`,
      });
      return {
        outcome: "failed",
        adJobId,
        sceneJobsCreated,
        errorMessage: `Template not found or not approved: ${scene.templateCode}`,
      };
    }

    // Build CreateSceneRenderJobInput
    const sceneInput = {
      templateId: template.id,
      character: scene.character,
      background: scene.background ?? { mode: "auto" as const },
      copy: scene.copy ?? {},
      product: scene.product ?? {},
      outputOptions: {
        fps: snapshot.outputOptions.fps,
        generateThumbnail: snapshot.outputOptions.generateThumbnail ?? true,
        generatePreviewClip: snapshot.outputOptions.generatePreviewClip ?? true,
      },
    };

    let sceneJobId: string;
    try {
      const result = await createSceneRenderJob(sceneInput, userId);
      sceneJobId = result.sceneJobId;
    } catch (err) {
      await transitionSequenceStage(adJobId, "assembly_failed", {
        errorCode: "SCENE_JOB_CREATE_FAILED",
        errorMessage: `Failed to create scene render job for sceneId=${scene.sceneId}: ${String(err)}`,
      });
      return {
        outcome: "failed",
        adJobId,
        sceneJobsCreated,
        errorMessage: String(err),
      };
    }

    refMap.set(scene.sceneId, {
      sceneId: scene.sceneId,
      order: scene.order,
      category: scene.category,
      templateCode: scene.templateCode,
      sceneJobId,
      status: "rendering",
      outputMetadata: null,
      failureReason: null,
    });

    sceneJobsCreated++;
  }

  // ── 4. Persist updated refs + transition to scene_collecting
  const updatedRefs = scenes
    .sort((a, b) => a.order - b.order)
    .map((s) => refMap.get(s.sceneId)!);

  await transitionSequenceStage(adJobId, "scene_collecting", {
    sceneJobRefs: updatedRefs,
  });

  // scene_collect step is triggered by scene render completion callbacks,
  // but enqueue an initial check in case all scenes were already done
  // fire-and-forget: collect은 scene render 완료 시 트리거되어야 함.
  // 동기 중첩 호출 루프 방지를 위해 await 하지 않음.
  enqueueSequenceStep(adJobId, "sequence_collect").catch((err) => {
    console.warn(JSON.stringify({
      action: "sequence_collect_initial_enqueue_failed",
      adJobId,
      error: String(err),
    }));
  });

  return { outcome: "created", adJobId, sceneJobsCreated };
}
