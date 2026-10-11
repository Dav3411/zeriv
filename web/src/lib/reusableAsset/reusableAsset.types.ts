/**
 * reusableAsset/reusableAsset.types.ts — Reusable asset, lineage, approval, brand memory types.
 *
 * 재사용 자산의 범위:
 *   brand-scoped  — 브랜드 전반에서 쓰이는 자산 (ending config, product config, 브랜드 copy 등)
 *   campaign-scoped — 특정 캠페인에서만 쓰이는 자산 (scene config, sequence preset 등)
 *
 * 자산 상태 흐름:
 *   draft → approved / rejected / archived
 *   (rejected 자산은 수정 후 새 자산으로 저장해야 함)
 *   (archived = 더 이상 사용하지 않지만 lineage 보존 목적으로 삭제하지 않음)
 *
 * Apply 정책:
 *   status=approved 자산만 apply API 호출 가능.
 *   draft/rejected/archived 자산을 apply하면 403 반환.
 *
 * Asset type별 payload union:
 *   scene_config       — template + char + product + copy 조합 (scene 1개 재사용)
 *   copy_block         — 슬롯별 텍스트 집합 (template/category 단위)
 *   product_config     — product zone 설정 묶음
 *   ending_config      — ending composition input 고정값
 *   sequence_preset    — AdSceneSpec[] 전체 순서 + outputOptions
 *   character_preset   — character 설정 (characterId + outfit + expression)
 */

import type {
  SceneCharacterInput,
  SceneBackgroundInput,
  SceneCopyInput,
  SceneProductInput,
} from "@/lib/sceneRender/sceneRender.schema";
import type { EndingCompositionInput } from "@/lib/sceneCompose/ending/ending.schema";
import type { AdSceneSpec, SequenceOutputOptions } from "@/lib/adSequence/adSequence.schema";
import type { SequenceValidationResult, SequencePolicy } from "@/lib/adSequence/adSequence.types";

// ─── Asset type / status ──────────────────────────────────────────────────────

/**
 * 재사용 자산의 종류.
 * 각 type에 대응하는 payload 타입이 존재함 (ReusableAssetPayload union).
 */
export type ReusableAssetType =
  | "scene_config"      // scene render 1개의 전체 구성 (template + char + product + copy)
  | "copy_block"        // 슬롯 ID → 텍스트 매핑 (template 단위)
  | "product_config"    // product zone 구성 묶음
  | "ending_config"     // ending composition input 고정값
  | "sequence_preset"   // 시퀀스 전체 AdSceneSpec[] + outputOptions
  | "character_preset"; // character 설정 (characterId + outfit + expression)

/**
 * 자산 승인 상태.
 *   draft    — 저장됨, 아직 검토 전 (apply 불가)
 *   approved — 승인됨, 재사용 가능 (apply 허용)
 *   rejected — 반려됨, 수정 후 새 자산으로 저장 (apply 불가)
 *   archived — 보관됨, lineage 보존 목적으로 삭제하지 않음 (apply 불가)
 *
 * pending_review를 없앤 이유:
 *   심사 중 상태는 approval_records 테이블로 추적.
 *   asset 자체 status는 결정된 상태(draft/approved/rejected/archived)만 저장.
 */
export type AssetStatus = "draft" | "approved" | "rejected" | "archived";

// ─── Payload union ────────────────────────────────────────────────────────────

/**
 * scene render 1개의 전체 구성.
 * 특정 template + character + product + copy 조합을 재사용할 때 사용.
 */
export interface SceneConfigPayload {
  type: "scene_config";
  templateCode: string;
  templateId: string;
  category: string;
  character: SceneCharacterInput;
  background: SceneBackgroundInput;
  copy: SceneCopyInput;
  product: SceneProductInput;
}

/**
 * 특정 template/category 단위의 copy 집합.
 * slotId → 텍스트 매핑. hook, benefit, cta 등 카피 단위 재사용.
 */
export interface CopyBlockPayload {
  type: "copy_block";
  templateCode: string | null;   // null = 범용 copy (template 무관)
  category: string | null;       // "hook" | "benefit" | "cta" | null
  slots: Record<string, string>; // { [slotId]: text }
  language: string;              // "ko" | "en" 등
}

/**
 * product zone 구성 묶음.
 * 동일 제품을 여러 시퀀스에서 재사용할 때 사용.
 */
export interface ProductConfigPayload {
  type: "product_config";
  productName: string | null;
  zones: SceneProductInput;       // Record<zoneId, ProductZoneInput>
}

/**
 * ending composition input 고정값.
 * 브랜드 ending 디자인을 재사용할 때 사용.
 */
export interface EndingConfigPayload {
  type: "ending_config";
  compositionInput: EndingCompositionInput;
}

/**
 * sequence_preset payload 내 씬 1개의 확장 구조.
 * AdSceneSpec + 자산 참조 + template 버전 정보 포함.
 */
export interface SequencePresetScene extends AdSceneSpec {
  /**
   * 이 씬을 생성할 때 사용된 template 버전.
   * null이면 template version이 기록되지 않은 구버전 preset.
   * 현재 template 버전과 다르면 preset 적용 시 경고.
   */
  templateSnapshotVersion: number | null;
  /**
   * 이 씬 구성에 참조된 재사용 자산 목록.
   * apply 시 각 assetId로 최신 approved payload를 로드할 수 있음.
   */
  reusableAssetRefs: SequencePresetAssetRef[];
}

/**
 * sequence_preset 내 개별 씬이 참조하는 reusable asset 참조.
 */
export interface SequencePresetAssetRef {
  assetId: string;
  assetType: ReusableAssetType;
  /**
   * 이 자산이 적용된 슬롯 또는 존 ID.
   * copy_block → slotId, product_config → zoneId, ending_config → null
   */
  slotOrZoneId: string | null;
}

/**
 * 시퀀스 전체 구성을 preset으로 저장.
 * 씬 순서 + 각 씬 spec + output options + 생성 시점 policy snapshot 포함.
 *
 * 이 preset을 적용하면 각 씬의 character/product/copy만 교체하여
 * 새 시퀀스를 빠르게 생성 가능.
 *
 * templateSnapshotVersion을 통해 template 변경 시 preset 깨짐을 감지.
 * reusableAssetRefs를 통해 참조 자산 최신화 가능.
 */
export interface SequencePresetPayload {
  type: "sequence_preset";
  /** 확장된 씬 목록 (AdSceneSpec + template 버전 + 자산 참조) */
  scenes: SequencePresetScene[];
  outputOptions: SequenceOutputOptions;
  validationSummary: SequenceValidationResult | null;
  /** 이 preset이 derived된 원본 adJobId */
  sourceAdJobId: string | null;
  /**
   * preset 생성 시점의 SequencePolicy 스냅샷.
   * 이후 policy가 변경되어도 preset 자체의 validation 기준을 보존.
   */
  sequencePolicySnapshot: SequencePolicy | null;
}

/**
 * character 설정 고정값.
 * 동일 character + outfit + expression 조합을 여러 시퀀스에서 재사용.
 */
export interface CharacterPresetPayload {
  type: "character_preset";
  characterId: string;
  characterVersionId: string | null;
  outfit: string | null;
  expression: string | null;
  /** 추가 character 파라미터 (자유 형식) */
  extra: Record<string, unknown> | null;
}

export type ReusableAssetPayload =
  | SceneConfigPayload
  | CopyBlockPayload
  | ProductConfigPayload
  | EndingConfigPayload
  | SequencePresetPayload
  | CharacterPresetPayload;

// ─── Reusable asset ───────────────────────────────────────────────────────────

/**
 * 재사용 자산 엔티티.
 *
 * brandId만 있고 campaignId=null → brand-scoped 자산.
 * brandId + campaignId → campaign-scoped 자산.
 */
export interface ReusableAsset {
  id: string;
  brandId: string;
  /** null = brand-scoped, non-null = campaign-scoped */
  campaignId: string | null;
  assetType: ReusableAssetType;
  name: string;
  status: AssetStatus;
  payload: ReusableAssetPayload;
  /**
   * 이 자산이 derived된 scene_render_job.id.
   * (sourceSceneJobId 대신 명시적 이름 사용)
   */
  sourceSceneRenderJobId: string | null;
  /** 이 자산이 derived된 ad_sequence_job.id */
  sourceAdJobId: string | null;
  /**
   * 재현 가능성(reproducibility)을 위한 resolved input 스냅샷.
   * 자산 생성 시점의 실제 입력값 전체를 고정.
   * - scene_config: CreateSceneRenderJobInput 전체
   * - copy_block: resolvedCopy + slotDefinitions
   * - sequence_preset: CreateAdSequenceJobInput 전체
   * - 기타: 해당 시점의 payload 원본
   *
   * 이 값이 있으면 같은 입력으로 동일 자산을 재생성 가능.
   */
  sourceSnapshot: Record<string, unknown> | null;
  /**
   * 자산 생성 시점의 template/schema 버전 식별자.
   * 형식: "<templateCode>@v<version>" 또는 "schema@<semver>"
   * 이 버전이 현재 template 버전과 다르면 preset이 깨질 가능성 있음.
   */
  sourceVersion: string | null;
  tags: string[];
  /**
   * 이 자산의 예상 용도 목록.
   * "product_launch" | "seasonal" | "awareness" | "retargeting" 등 자유 값.
   */
  useCases: string[];
  /** 승인자 user_id — null이면 미승인 */
  approvedBy: string | null;
  approvalNote: string | null;
  /**
   * 이 자산이 재사용된 횟수.
   * apply-asset API 호출 시 increment.
   */
  reusedCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Asset lineage ────────────────────────────────────────────────────────────

/**
 * 자산의 파생 유형.
 *   original — 직접 생성 (render 결과에서 추출 또는 수동 입력)
 *   derived  — 기존 자산을 부분 수정하여 생성
 *   cloned   — 기존 자산을 그대로 복사하여 생성 (brand/campaign 이동)
 */
export type LineageDerivationType = "original" | "derived" | "cloned";

/**
 * 자산 lineage 엔티티.
 * "어떤 template + character + product + copy 조합에서 나왔는지"를 추적.
 *
 * 한 자산은 항상 lineage 레코드 1개를 가짐.
 * derived/cloned 자산은 sourceAssetId를 통해 원본으로 소급 가능.
 */
export interface AssetLineage {
  id: string;
  assetId: string;
  /** derived/cloned인 경우 원본 자산 ID */
  sourceAssetId: string | null;
  /** render에서 직접 추출된 경우 원본 scene job ID */
  sourceSceneJobId: string | null;
  /** sequence에서 추출된 경우 원본 sequence job ID */
  sourceAdJobId: string | null;
  /** 파생된 원본 캠페인 ID */
  sourceCampaignId: string | null;
  /** 생성에 사용된 template ID */
  templateId: string | null;
  templateCode: string | null;
  /**
   * 생성 시 사용된 character 참조.
   * lineage 기록용 — 실제 char input은 payload에 있음.
   */
  characterRef: CharacterLineageRef | null;
  /**
   * 생성 시 사용된 product 참조.
   */
  productRef: ProductLineageRef | null;
  /**
   * 생성 시 사용된 copy 참조.
   */
  copyRef: CopyLineageRef | null;
  /** 사용된 ending profile (ending_config 자산인 경우) */
  endingProfile: string | null;
  derivationType: LineageDerivationType;
  /** "from approved scene of campaign X" 등 파생 경위 메모 */
  derivationNote: string | null;
  createdAt: string;
}

export interface CharacterLineageRef {
  characterId: string;
  characterVersionId: string | null;
  outfit: string | null;
}

export interface ProductLineageRef {
  productName: string | null;
  zoneIds: string[];
}

export interface CopyLineageRef {
  language: string;
  slotIds: string[];
}

// ─── Approval record ──────────────────────────────────────────────────────────

export type ApprovalAction = "approved" | "rejected" | "revision_requested";

/**
 * 자산에 대한 개별 승인/반려 이력.
 * 한 자산에 여러 approval_records가 있을 수 있음 (심사 → 반려 → 재심사 등).
 * 최신 record가 현재 상태.
 */
export interface ApprovalRecord {
  id: string;
  assetId: string;
  reviewerId: string;
  action: ApprovalAction;
  note: string | null;
  reviewedAt: string;
}

// ─── Brand memory ──────────────────────────────────────────────────────────────

/**
 * 브랜드 수준의 고정 제약 / 운영 규칙 스냅샷.
 * sequence validation이나 자산 생성 시 참조.
 * frozenAt 기준으로 버전 관리 가능.
 */
export interface BrandRulesSnapshot {
  /** 시퀀스에 ending scene 필수 여부 */
  requireEnding: boolean;
  /** 시퀀스 최대 씬 수 (기본값: 10) */
  maxSceneCount: number;
  /** 허용된 category 목록 (비어있으면 전체 허용) */
  allowedCategories: string[];
  /** 브랜드 고유 운영 메모 (자유 형식) */
  note: string | null;
  frozenAt: string;
}

/**
 * 브랜드별 memory snapshot.
 * 승인된 copy, ending profile, template, sequence pattern 등을 저장.
 *
 * 고정 키 구조 (최소 보장):
 *   approvedCopyBlocks        — 승인된 copy block 요약
 *   approvedEndingProfiles    — 승인된 ending 설정 요약
 *   preferredTemplateSet      — 선호 template 목록
 *   preferredCharacterPresets — 선호 character 설정 요약
 *   winningSequencePatterns   — 성과 좋은 sequence 패턴
 *   brandRulesSnapshot        — 브랜드 운영 규칙 고정값
 *   defaultSequencePolicy     — 새 시퀀스 생성 시 기본 SequencePolicy
 *   extraMemory               — 확장 필드 (자유 형식 JSONB)
 *
 * TODO: v0.2 — 완료된 시퀀스에서 winning pattern 자동 추출
 * TODO: v0.2 — brand_fit_score 도입 (template × brand 조합 성과 기반)
 */
export interface BrandMemory {
  brandId: string;

  /** 승인된 copy block 목록. 각 항목 = approved copy_block 자산 요약 */
  approvedCopyBlocks: ApprovedCopyEntry[];

  /** 승인된 ending profile 목록. 각 항목 = approved ending_config 자산 요약 */
  approvedEndingProfiles: ApprovedEndingEntry[];

  /**
   * 선호 template 집합.
   * (이전: preferredTemplates → 키 이름 통일)
   * v0.1: 수동 등록. v0.2: 시퀀스 완료 데이터 기반 자동 추출.
   */
  preferredTemplateSet: PreferredTemplateEntry[];

  /**
   * 선호 character preset 목록.
   * 브랜드 모델로 자주 쓰이는 character 설정 요약.
   */
  preferredCharacterPresets: PreferredCharacterPresetEntry[];

  /**
   * 성과가 좋았거나 반복 사용된 sequence category 패턴.
   * 예: ["hook", "product_show", "benefit", "cta", "ending"]
   * v0.1: 수동 등록. v0.2: 자동 추출.
   */
  winningSequencePatterns: WinningSequencePatternEntry[];

  /** 저장된 product 설정 목록 */
  savedProductConfigs: SavedProductConfigEntry[];

  /**
   * 브랜드 운영 규칙 스냅샷.
   * null이면 DEFAULT_SEQUENCE_POLICY + 기본값으로 동작.
   */
  brandRulesSnapshot: BrandRulesSnapshot | null;

  /**
   * 새 시퀀스 생성 시 기본으로 적용할 SequencePolicy.
   * null이면 DEFAULT_SEQUENCE_POLICY (requireEnding=false) 사용.
   */
  defaultSequencePolicy: SequencePolicy | null;

  /**
   * 확장 필드. 위 고정 키에 포함되지 않는 브랜드별 메타데이터를 자유롭게 저장.
   * 구조화가 필요해지면 별도 고정 키로 승격.
   */
  extraMemory: Record<string, unknown> | null;

  updatedAt: string;
}

export interface ApprovedCopyEntry {
  assetId: string;
  name: string;
  category: string | null;
  language: string;
  slotPreview: Record<string, string>; // { [slotId]: first 30 chars }
}

export interface ApprovedEndingEntry {
  assetId: string;
  name: string;
  layoutMode: string;
  ctaText: string | null;
  brandLogoUrl: string | null;
}

export interface PreferredTemplateEntry {
  templateCode: string;
  templateId: string;
  category: string;
  note: string | null;
  /** true면 새 시퀀스 생성 UI에서 기본값으로 표시 */
  isDefault: boolean;
}

export interface PreferredCharacterPresetEntry {
  assetId: string;
  name: string;
  characterId: string;
  outfit: string | null;
  /** true면 새 시퀀스 생성 UI에서 기본 모델로 표시 */
  isDefault: boolean;
}

export interface WinningSequencePatternEntry {
  /** 씬 category 순서 배열: ["hook", "product_show", "cta", "ending"] */
  categorySequence: string[];
  sceneCount: number;
  note: string | null;
  /**
   * 이 패턴이 몇 번 사용되었는지 (수동 또는 자동 집계).
   * TODO: v0.2 — 완료된 시퀀스에서 자동 집계
   */
  usageCount: number;
}

export interface SavedProductConfigEntry {
  assetId: string;
  name: string;
  productName: string | null;
  zoneIds: string[];
}

// ─── Asset reuse metadata (apply 시 반환) ────────────────────────────────────

/**
 * reusable asset을 새 render request에 적용할 때 반환되는 메타데이터.
 * caller는 이 정보로 render input을 채운다.
 */
export interface AssetApplyResult {
  assetId: string;
  assetType: ReusableAssetType;
  payload: ReusableAssetPayload;
  /** apply 후 업데이트된 reusedCount */
  reusedCount: number;
  appliedAt: string;
}
