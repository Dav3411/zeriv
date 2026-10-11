/**
 * adSequence.sequenceValidate.ts — /api/internal/sequence-validate service.
 *
 * 역할:
 *   1. ad_sequence_jobs row 조회 + 단계 확인 (idempotency)
 *   2. validateAdSequence(scenes, policy) 실행
 *   3. 결과를 DB에 저장 (transitionSequenceStage)
 *   4. 통과 시 scene_jobs_create 큐 등록
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateAdSequence } from "./adSequence.validator";
import { transitionSequenceStage } from "./adSequence.stage";
import { enqueueSequenceStep } from "./adSequence.orchestrator";
import type { AdSequenceJobSnapshot, SequencePolicy } from "./adSequence.types";
import type { AdSceneSpec } from "./adSequence.schema";
import { DEFAULT_SEQUENCE_POLICY } from "./adSequence.types";

export interface SequenceValidateResult {
  outcome: "passed" | "failed" | "skipped";
  adJobId: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function runSequenceValidate(adJobId: string): Promise<SequenceValidateResult> {
  // ── 1. Load job row
  const { data: row, error: fetchError } = await supabaseAdmin
    .from("ad_sequence_jobs")
    .select("id, current_stage, job_snapshot")
    .eq("id", adJobId)
    .single();

  if (fetchError || !row) {
    throw new Error(`sequence-validate: job not found (adJobId=${adJobId})`);
  }

  const r = row as Record<string, unknown>;
  const currentStage = r.current_stage as string;

  // ── 2. Idempotency — skip if already past this step
  if (currentStage !== "sequence_queued" && currentStage !== "sequence_validating") {
    return { outcome: "skipped", adJobId };
  }

  // ── 3. Transition → sequence_validating
  await transitionSequenceStage(adJobId, "sequence_validating");

  const snapshot = r.job_snapshot as AdSequenceJobSnapshot;
  const scenes: AdSceneSpec[] = snapshot?.scenes ?? [];
  const policy: SequencePolicy = snapshot?.outputOptions
    ? extractPolicyFromSnapshot(snapshot)
    : DEFAULT_SEQUENCE_POLICY;

  // ── 4. Validate
  const validationResult = validateAdSequence(scenes, policy);

  if (!validationResult.valid) {
    await transitionSequenceStage(adJobId, "sequence_validation_failed", {
      errorCode: validationResult.errorCode,
      errorMessage: validationResult.errorMessage,
      validationResult,
    });

    return {
      outcome: "failed",
      adJobId,
      errorCode: validationResult.errorCode,
      errorMessage: validationResult.errorMessage,
    };
  }

  // ── 5. Passed → scene_jobs_creating + enqueue next step
  await transitionSequenceStage(adJobId, "scene_jobs_creating", {
    validationResult,
  });

  await enqueueSequenceStep(adJobId, "scene_jobs_create");

  return { outcome: "passed", adJobId };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * job_snapshot에서 sequencePolicy를 추출.
 * snapshot에 policy가 없으면 DEFAULT_SEQUENCE_POLICY 반환.
 */
function extractPolicyFromSnapshot(snapshot: AdSequenceJobSnapshot): SequencePolicy {
  // appliedAssets에서 sequence_preset 자산의 sequencePolicySnapshot 추출
  const presetAsset = snapshot.appliedAssets?.find(
    (a) => a.assetType === "sequence_preset" && a.applyScope === "sequence"
  );
  // NOTE: sequencePolicySnapshot은 preset payload에만 있음 — 여기서는 job_snapshot에 없으므로
  //       DEFAULT_SEQUENCE_POLICY 사용. 향후 job_snapshot에 policy 포함 시 확장.
  void presetAsset;
  return DEFAULT_SEQUENCE_POLICY;
}
