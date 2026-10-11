/**
 * adSequence.types.ts — Ad sequence orchestrator 전체 타입 정의.
 *
 * 커버 범위:
 *   - 시퀀스 stage / status (orchestrator state machine)
 *   - per-scene job reference (scene render 추적)
 *   - sequence validation result
 *   - transition compatibility
 *   - cut plan (v0.1: cut-only assembly)
 *   - assembly warnings
 *   - job snapshot (frozen input)
 *   - output metadata (final 결과물 카탈로그)
 *   - API response
 */

import type { AdSceneSpec, AdSceneCategory, SequenceOutputOptions } from "./adSequence.schema";
import type { SceneOutputMetadata } from "@/lib/sceneRender/sceneRender.types";
import type { ReusableAssetType } from "@/lib/reusableAsset/reusableAsset.types";

// ─── Stage / Status ───────────────────────────────────────────────────────────

/**
 * 시퀀스 job의 내부 세분화 상태.
 *
 * [Preparation]
 *   sequence_queued → sequence_validating → scene_jobs_creating → scene_collecting
 *
 * [Scene collecting]
 *   scene_collecting: 모든 scene render job 완료 대기
 *   scene_collection_failed: 필수 scene 1개 이상 실패 (terminal)
 *
 * [Resolving]
 *   sequence_resolving: transition compatibility 검사 + cut plan 계산
 *
 * [Assembly]
 *   assembly_preparing → assembly_rendering → assembly_encoding → assembly_completed
 *
 * [Terminal failures]
 *   sequence_validation_failed / scene_collection_failed / assembly_failed
 */
export type AdSequenceStage =
  // ── Preparation
  | "sequence_queued"
  | "sequence_validating"
  | "sequence_validation_failed"  // terminal-fail: 입력 유효성 위반
  | "scene_jobs_creating"
  | "scene_collecting"            // 모든 scene render 완료 대기
  | "scene_collection_failed"     // terminal-fail: 필수 scene render 실패
  // ── Resolving
  | "sequence_resolving"          // transition check + cut plan 계산
  // ── Assembly
  | "assembly_preparing"          // FFmpeg 입력 파일 준비
  | "assembly_rendering"          // FFmpeg concat 실행
  | "assembly_encoding"           // 최종 인코딩 + 썸네일 + metadata 저장
  // ── Terminal
  | "assembly_completed"
  | "assembly_failed";

/** 사용자 노출 상태 (6단계) */
export type AdSequenceStatus =
  | "queued"
  | "validating"
  | "rendering"    // scene_collecting + sequence_resolving
  | "assembling"   // assembly_preparing/rendering/encoding
  | "completed"
  | "failed";

// ─── Per-scene job reference ──────────────────────────────────────────────────

export type SceneJobRefStatus =
  | "pending"    // sceneJobId 미생성
  | "creating"   // scene render job DB insert 중
  | "rendering"  // scene render 파이프라인 진행 중
  | "completed"  // scene render 완료, outputMetadata 수집됨
  | "failed"     // render 실패 (optional=false → sequence 실패)
  | "skipped";   // optional=true + failed → skip

/**
 * 시퀀스 내 각 scene render job의 추적 구조.
 * ad_sequence_jobs.scene_job_refs JSONB에 배열로 저장.
 */
export interface SceneJobRef {
  sceneId: string;
  order: number;
  category: AdSceneCategory;
  templateCode: string;
  sceneJobId: string | null;
  status: SceneJobRefStatus;
  /** render 완료 시 기록. assembly 때 직접 사용 */
  outputMetadata: SceneOutputMetadata | null;
  failureReason: string | null;
}

// ─── Sequence validation ──────────────────────────────────────────────────────

/**
 * 시퀀스 입력 유효성 위반 코드.
 * hard fail → sequence_validation_failed 전환.
 */
export type SequenceValidationErrorCode =
  | "SEQ_TOO_FEW_SCENES"           // < 2 scenes
  | "SEQ_TOO_MANY_SCENES"          // > 10 scenes
  | "SEQ_ORDER_GAP"                // order 값이 1,2,...,N 연속이 아님
  | "SEQ_SCENE_ID_DUPLICATE"       // sceneId 중복
  | "SEQ_HOOK_NOT_FIRST"           // hook scene이 order=1이 아님
  | "SEQ_ENDING_NOT_LAST"          // ending scene이 마지막이 아님
  | "SEQ_DUPLICATE_HOOK"           // hook scene 2개 이상
  | "SEQ_DUPLICATE_ENDING"         // ending scene 2개 이상
  | "SEQ_INVALID_CATEGORY_ORDER"   // category 순서 규칙 위반 (ex. ending 뒤에 다른 scene)
  | "SEQ_CTA_INVALID_POSITION"     // cta 이후에 hook/benefit/lifestyle/product_show 등장
  | "SEQ_ENDING_REQUIRED";         // policy.requireEnding=true 인데 ending scene 없음

/** soft 경고 (시퀀스는 계속 진행) */
export type SequenceValidationWarningCode =
  | "SEQ_NO_HOOK"
  | "SEQ_NO_ENDING"                         // ending 없음 — policy.requireEnding=true 시 hard fail로 승격
  | "SEQ_NO_CTA"
  | "SEQ_ONLY_2_SCENES"
  | "SEQ_NO_PRODUCT_SHOW_WITH_PRICE_ENDING"; // ending 있는데 product_show scene 없음

export interface SequenceValidationWarning {
  code: SequenceValidationWarningCode;
  message: string;
}

export interface SequenceValidationResult {
  valid: boolean;
  errorCode?: SequenceValidationErrorCode;
  errorMessage?: string;
  warnings: SequenceValidationWarning[];
}

// ─── Sequence policy ──────────────────────────────────────────────────────────

/**
 * 시퀀스 validation 동작을 제어하는 정책 플래그.
 *
 * requireEnding:
 *   false(기본값): ending 없으면 SEQ_NO_ENDING soft warning만 발생.
 *   true: ending 없으면 SEQ_ENDING_REQUIRED hard fail → sequence_validation_failed.
 *   TODO: v0.2 production policy에서 requireEnding=true로 승격.
 *         광고 숏폼 product에서는 ending 없는 시퀀스를 허용하지 않아야 함.
 */
export interface SequencePolicy {
  requireEnding: boolean;
}

export const DEFAULT_SEQUENCE_POLICY: SequencePolicy = {
  requireEnding: false,
};

// ─── Transition compatibility ─────────────────────────────────────────────────

/**
 * 인접한 두 scene 간 연결 가능성.
 * v0.1: shotType 기반 단순 규칙 (cut-only이므로 hard_fail 거의 없음)
 * v0.2: color temperature, character consistency 체크 추가 예정
 */
export type TransitionCompatibility = "compatible" | "warning" | "hard_fail";

export interface TransitionCheck {
  fromSceneId: string;
  toSceneId: string;
  fromShotType: string;
  toShotType: string;
  compatibility: TransitionCompatibility;
  reason: string | null;
}

// ─── Collect result ───────────────────────────────────────────────────────────

/**
 * sequence-collect 단계에서 수집한 씬 1개의 조립 입력 정보.
 * assembly 단계에서 scene R2 자산 URL + trim 정보 접근에 사용.
 */
export interface CollectSceneEntry {
  sceneId: string;
  sceneJobId: string;
  order: number;
  category: AdSceneCategory;
  templateCode: string;
  optional: boolean;
  // ── Assets from SceneOutputMetadata
  finalSceneUrl: string;
  thumbnailUrl: string;
  previewClipUrl: string | null;
  // ── Timing
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  // ── Cut hints
  shotType: string;
  safeCutFrames: { startFrame: number; endFrame: number } | null;
  // ── Applied inputs (for audit / replay)
  appliedCopy: Record<string, string>;
  appliedProductZones: Record<string, string>;
  // ── Encode quality
  encodeQuality: { passed: boolean; score: number | null };
}

/**
 * sequence-collect 완료 후 ad_sequence_jobs.cut_plan 컬럼에 저장되는 proto 결과.
 * assemblyType="scene_bundle"로 CutPlan(assemblyType="cut_only")과 구분.
 *
 * sequence_resolving 단계에서 이 값을 읽어 실제 CutPlan으로 변환한다.
 * TODO: sequence_resolving 구현 시 SequenceCollectResult → CutPlan 변환 추가.
 */
export interface SequenceCollectResult {
  type: "scene_bundle";
  collectedAt: string;
  totalScenes: number;
  requiredSceneCount: number;
  completedCount: number;
  /** optional=true 이었고 render 실패 → skip 처리된 씬 수 */
  skippedCount: number;
  readyForAssembly: true;
  orderedScenes: CollectSceneEntry[];
}

// ─── Cut plan ─────────────────────────────────────────────────────────────────

/**
 * 씬 1개의 trim 정보.
 * safeCutFrames 기반으로 계산한다.
 * trimStartSec ~ trimEndSec 구간만 사용.
 */
export interface SceneCutPlan {
  sceneId: string;
  sceneJobId: string;
  order: number;
  category: string;
  templateCode: string;
  /** R2 key of SceneOutputMetadata.assets.finalSceneUrl */
  inputVideoKey: string;
  /** 원본 영상 전체 길이 (초) */
  totalDurationSec: number;
  /** 트림 시작 (초). safeCutFrames.startFrame/fps. null이면 0 */
  trimStartSec: number;
  /** 트림 끝 (초). safeCutFrames.endFrame/fps. null이면 totalDurationSec */
  trimEndSec: number;
  /** trimEndSec - trimStartSec */
  usedDurationSec: number;
}

export interface CutPlan {
  /** v0.1: cut-only (transition 없음) */
  assemblyType: "cut_only";
  scenes: SceneCutPlan[];
  totalDurationSec: number;
  fps: number;
  width: number;
  height: number;
}

// ─── Assembly warnings ────────────────────────────────────────────────────────

export interface AssemblyWarning {
  code:
    | "TRANSITION_MISMATCH"   // 인접 씬 shotType 불일치 (warning, not fail in v0.1)
    | "SCENE_SKIPPED"         // optional scene skip
    | "TRIM_FALLBACK"         // safeCutFrames null → 전체 사용
    | "DURATION_SHORT"        // 씬 usedDurationSec < 1s (너무 짧음)
    | "TARGET_DURATION_MISS"; // targetDurationSec 대비 ±20% 초과
  sceneId?: string;
  message: string;
}

// ─── Applied asset telemetry ──────────────────────────────────────────────────

/**
 * job 생성 시 reusable asset이 적용된 기록.
 * job_snapshot.appliedAssets[]에 포함되어 재현 가능성 + 디버깅에 활용.
 *
 * applyScope:
 *   "sequence" — sequence_preset으로 전체 씬 구조 대체
 *   "scene"    — 특정 sceneId의 copy/product/character 일부 교체
 */
export interface AppliedAssetRecord {
  assetId: string;
  assetType: ReusableAssetType;
  appliedAt: string;
  applyScope: "sequence" | "scene";
  /** "sequence" scope이면 null */
  sceneId: string | null;
  reusedCount: number;
  /** overrides가 하나라도 적용되었는지 */
  overridesApplied: boolean;
}

// ─── Job snapshot ─────────────────────────────────────────────────────────────

/**
 * job 생성 시점에 모든 입력을 고정한 구조체.
 * ad_sequence_jobs.job_snapshot JSONB에 저장.
 */
export interface AdSequenceJobSnapshot {
  scenes: AdSceneSpec[];
  outputOptions: SequenceOutputOptions;
  frozenAt: string;
  /**
   * 이 job에 적용된 reusable asset 목록.
   * null이면 asset apply 없이 생성된 job.
   */
  appliedAssets: AppliedAssetRecord[] | null;
  /**
   * 이 job과 연결된 campaign_sequences.id.
   * assembly 완료 시 output_snapshot 자동 업데이트에 사용.
   * null이면 campaign과 무관하게 생성된 독립 job.
   */
  campaignSequenceId: string | null;
}

// ─── Output metadata ──────────────────────────────────────────────────────────

/** durationSummary 내 씬별 항목 */
export interface PerSceneDurationEntry {
  sceneId: string;
  category: string;
  usedDurationSec: number;
}

/**
 * 최종 광고 영상 결과물의 메타데이터.
 * ad_sequence_jobs.output_metadata JSONB + R2 JSON으로 저장.
 * 이후 campaign 조립 단계(step 6)에서 씬 카탈로그로 참조.
 */
export interface AdSequenceOutputMetadata {
  adJobId: string;

  // ── Final assets
  finalAdVideoUrl: string;
  thumbnailUrl: string;
  previewClipUrl: string | null;

  // ── Ordered scenes
  orderedScenes: Array<{
    order: number;
    sceneId: string;
    sceneJobId: string;
    category: string;
    templateCode: string;
    cutPlan: SceneCutPlan;
  }>;

  // ── Cut plan
  cutPlan: CutPlan;

  // ── Duration
  durationSummary: {
    totalDurationSec: number;
    perScene: PerSceneDurationEntry[];
  };

  // ── Transition checks
  transitionChecks: TransitionCheck[];

  // ── Assembly warnings
  assemblyWarnings: AssemblyWarning[];

  // ── Validation summary
  validationSummary: SequenceValidationResult;

  // ── Timing
  renderDurationMs: number;
  completedAt: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface CreateAdSequenceJobResponse {
  adJobId: string;
  status: "queued";
  currentStage: "sequence_queued";
  sceneCount: number;
}

export interface AdSequenceJobResponse {
  adJobId: string;
  status: AdSequenceStatus;
  currentStage: AdSequenceStage;
  progress: number;
  sceneJobRefs: SceneJobRef[];
  cutPlan: CutPlan | null;
  outputMetadata: AdSequenceOutputMetadata | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
