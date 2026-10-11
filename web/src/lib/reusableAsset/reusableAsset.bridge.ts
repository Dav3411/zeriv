/**
 * reusableAsset/reusableAsset.bridge.ts — Apply bridge.
 *
 * 재사용 자산을 scene render / sequence job 요청에 적용하는 유틸리티.
 * service.applyReusableAsset → payload 획득 → base request와 merge.
 *
 * 지원 자산 타입:
 *   scene_config       → applyReusableAssetToSceneRequest (templateId + char + bg + copy + product)
 *   copy_block         → applyReusableAssetToSceneRequest (copy.slots만 merge)
 *   product_config     → applyReusableAssetToSceneRequest (product zones만 merge)
 *   character_preset   → applyReusableAssetToSceneRequest (character만 merge)
 *   ending_config      → applyReusableAssetToSceneRequest (endingInput 반환, scene merge 없음)
 *   sequence_preset    → applyReusableAssetToSequenceRequest (scenes + outputOptions)
 *
 * TODO v0.2: product_config / character_preset 전용 bridge 함수 분리
 */

import { applyReusableAsset } from "./reusableAsset.service";
import { getBrandMemory } from "@/lib/campaign/campaign.service";
import type { AssetApplyResult } from "./reusableAsset.types";
import type {
  SceneConfigPayload,
  CopyBlockPayload,
  ProductConfigPayload,
  CharacterPresetPayload,
  EndingConfigPayload,
  SequencePresetPayload,
  PreferredTemplateEntry,
  BrandRulesSnapshot,
} from "./reusableAsset.types";
import type { CreateSceneRenderJobInput } from "@/lib/sceneRender/sceneRender.schema";
import type {
  CreateAdSequenceJobInput,
  AdSceneSpec,
} from "@/lib/adSequence/adSequence.schema";
import type { EndingCompositionInput } from "@/lib/sceneCompose/ending/ending.schema";
import type { SequencePolicy } from "@/lib/adSequence/adSequence.types";
import { DEFAULT_SEQUENCE_POLICY } from "@/lib/adSequence/adSequence.types";

// ─── Result types ─────────────────────────────────────────────────────────────

/**
 * scene-level asset apply 결과.
 *
 * merged: scene render job input에 자산 payload가 merge된 결과.
 *   scene_config    — templateId + character + background + copy + product 모두 채워짐
 *   copy_block      — copy.slots만 merge됨 (나머지는 base 값 유지)
 *   product_config  — product zones만 merge됨
 *   character_preset — character만 merge됨
 *   ending_config   — merged는 base 그대로 (endingInput에서 실제 값 사용)
 *
 * endingInput: ending_config 자산일 때만 non-null.
 *   이 값을 ending composition job input으로 직접 사용.
 */
export interface BridgeSceneResult {
  merged: Partial<CreateSceneRenderJobInput>;
  endingInput: EndingCompositionInput | null;
  applyResult: AssetApplyResult;
}

/**
 * sequence-level asset apply 결과.
 *
 * merged: sequence job input에 preset scenes + outputOptions가 merge된 결과.
 *   overrides.scenes가 있으면 preset scenes의 각 필드를 override.
 *   overrides.outputOptions가 있으면 preset outputOptions를 override.
 */
export interface BridgeSequenceResult {
  merged: Partial<CreateAdSequenceJobInput>;
  applyResult: AssetApplyResult;
}

/**
 * Brand memory에서 파생된 기본값 세트.
 * 새 시퀀스 생성 UI나 scene request 초기화 시 사용.
 */
export interface BrandMemoryDefaults {
  /** 새 시퀀스 생성 시 기본 policy. null이면 DEFAULT_SEQUENCE_POLICY 사용 */
  sequencePolicy: SequencePolicy;
  /** 선호 character 중 isDefault=true인 캐릭터 ID. null이면 없음 */
  defaultCharacterId: string | null;
  /** 선호 template 목록 (isDefault 포함) */
  preferredTemplates: PreferredTemplateEntry[];
  /** 브랜드 운영 규칙 스냅샷 (null이면 기본값) */
  brandRules: BrandRulesSnapshot | null;
}

// ─── Scene-level bridge ──────────────────────────────────────────────────────

/**
 * 재사용 자산을 scene render request에 적용.
 *
 * @param assetId   적용할 자산 ID (status=approved 필수)
 * @param userId    요청자 user ID (소유권 확인용)
 * @param base      기존 scene render request (부분 채워진 상태)
 * @param overrides 자산 payload 위에 강제로 덮어쓸 값 (optional)
 *
 * ending_config 자산의 경우 merged는 base 그대로이고,
 * result.endingInput에 compositionInput이 담겨 있음.
 */
export async function applyReusableAssetToSceneRequest(
  assetId: string,
  userId: string,
  base: Partial<CreateSceneRenderJobInput>,
  overrides?: Partial<CreateSceneRenderJobInput>,
): Promise<BridgeSceneResult> {
  const applyResult = await applyReusableAsset(assetId, userId);
  const payload = applyResult.payload;

  let merged: Partial<CreateSceneRenderJobInput> = { ...base };
  let endingInput: EndingCompositionInput | null = null;

  switch (payload.type) {
    case "scene_config": {
      const p = payload as SceneConfigPayload;
      merged = {
        ...base,
        templateId: p.templateId,
        character: mergeCharacter(base.character, p.character),
        background: p.background,
        copy: mergeCopy(base.copy, p.copy),
        product: mergeProduct(base.product, p.product),
        ...overrides,
      };
      break;
    }

    case "copy_block": {
      const p = payload as CopyBlockPayload;
      merged = {
        ...base,
        copy: mergeCopy(base.copy, p.slots),
        ...overrides,
      };
      break;
    }

    case "product_config": {
      const p = payload as ProductConfigPayload;
      merged = {
        ...base,
        product: mergeProduct(base.product, p.zones),
        ...overrides,
      };
      break;
    }

    case "character_preset": {
      const p = payload as CharacterPresetPayload;
      merged = {
        ...base,
        character: {
          characterId: p.characterId,
          outfitId: p.outfit ?? undefined,
          styleOverrides: undefined,
          ...overrides?.character,
        },
        ...overrides,
      };
      break;
    }

    case "ending_config": {
      const p = payload as EndingConfigPayload;
      endingInput = p.compositionInput;
      // scene request 자체는 변경하지 않음
      merged = { ...base, ...overrides };
      break;
    }

    default: {
      // sequence_preset은 이 함수로 처리하지 않음
      merged = { ...base, ...overrides };
      break;
    }
  }

  return { merged, endingInput, applyResult };
}

// ─── Sequence-level bridge ───────────────────────────────────────────────────

/**
 * sequence_preset 자산을 sequence job request에 적용.
 *
 * @param assetId   적용할 자산 ID (assetType=sequence_preset, status=approved 필수)
 * @param userId    요청자 user ID
 * @param base      기존 sequence job request (비어있어도 됨)
 * @param overrides preset 위에 덮어쓸 값 (optional)
 *
 * preset의 SequencePresetScene을 AdSceneSpec으로 매핑 (확장 필드 제거).
 * overrides.scenes가 있으면 sceneId 기준으로 개별 씬 필드 override.
 */
export async function applyReusableAssetToSequenceRequest(
  assetId: string,
  userId: string,
  base: Partial<CreateAdSequenceJobInput>,
  overrides?: Partial<CreateAdSequenceJobInput>,
): Promise<BridgeSequenceResult> {
  const applyResult = await applyReusableAsset(assetId, userId);
  const payload = applyResult.payload;

  if (payload.type !== "sequence_preset") {
    // 잘못된 타입은 base를 그대로 반환 (caller가 타입을 미리 확인해야 함)
    return {
      merged: { ...base, ...overrides },
      applyResult,
    };
  }

  const p = payload as SequencePresetPayload;

  // SequencePresetScene → AdSceneSpec (확장 필드 제거 + null optional 필드 정리)
  const presetScenes: AdSceneSpec[] = p.scenes.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ templateSnapshotVersion: _v, reusableAssetRefs: _r, ...spec }) => {
      // Zod optional 필드는 null을 허용하지 않으므로 null → undefined로 정규화
      const character = { ...spec.character };
      if (character.outfitId === null) delete character.outfitId;
      if (character.styleOverrides === null) delete character.styleOverrides;
      return { ...spec, character };
    },
  );

  // overrides.scenes가 있으면 sceneId 기준으로 merge
  const finalScenes = overrides?.scenes
    ? mergeSceneArrayWithOverrides(presetScenes, overrides.scenes)
    : presetScenes;

  const merged: Partial<CreateAdSequenceJobInput> = {
    ...base,
    scenes: finalScenes,
    outputOptions: {
      ...p.outputOptions,
      ...overrides?.outputOptions,
    },
    // clientRequestId는 override에서만 받음 (preset에서 복사하지 않음)
    ...(overrides?.clientRequestId
      ? { clientRequestId: overrides.clientRequestId }
      : {}),
  };

  return { merged, applyResult };
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

/**
 * 두 scene config를 merge하는 헬퍼.
 * override의 각 최상위 필드가 base를 덮어씀.
 * copy/product/character는 deep merge (슬롯/존 단위).
 */
export function mergeSceneConfigWithOverrides(
  base: Partial<CreateSceneRenderJobInput>,
  overrides: Partial<CreateSceneRenderJobInput>,
): Partial<CreateSceneRenderJobInput> {
  return {
    ...base,
    ...overrides,
    character:
      base.character || overrides.character
        ? mergeCharacter(base.character, overrides.character)
        : undefined,
    copy: mergeCopy(base.copy, overrides.copy),
    product: mergeProduct(base.product, overrides.product),
  };
}

/**
 * Brand memory에서 UI 초기화에 필요한 기본값을 추출.
 *
 * @param brandId 대상 brand ID
 * @param userId  요청자 user ID
 */
export async function resolveBrandMemoryDefaults(
  brandId: string,
  userId: string,
): Promise<BrandMemoryDefaults> {
  const memory = await getBrandMemory(brandId, userId);

  const sequencePolicy: SequencePolicy =
    (memory.defaultSequencePolicy as SequencePolicy | null) ??
    DEFAULT_SEQUENCE_POLICY;

  const defaultCharacterEntry = memory.preferredCharacterPresets.find(
    (e: { isDefault: boolean }) => e.isDefault,
  );

  return {
    sequencePolicy,
    defaultCharacterId: defaultCharacterEntry?.characterId ?? null,
    preferredTemplates: (memory.preferredTemplateSet as PreferredTemplateEntry[] | null) ?? [],
    brandRules:
      (memory.brandRulesSnapshot as
        | import("./reusableAsset.types").BrandRulesSnapshot
        | null) ?? null,
  };
}

// ─── Internal merge utils ─────────────────────────────────────────────────────

type CharInput = CreateSceneRenderJobInput["character"];

function mergeCharacter(
  base: CharInput | undefined,
  override: CharInput | undefined,
): CharInput {
  if (!base && !override) {
    // CreateSceneRenderJobInput.character는 required지만 Partial로 쓰이므로 타입 캐스트
    return {} as CharInput;
  }
  if (!base) return override!;
  if (!override) return base;
  return {
    ...base,
    ...override,
    styleOverrides:
      base.styleOverrides || override.styleOverrides
        ? { ...base.styleOverrides, ...override.styleOverrides }
        : undefined,
  };
}

type CopyInput = CreateSceneRenderJobInput["copy"];

function mergeCopy(
  base: CopyInput | undefined,
  override: CopyInput | Record<string, string> | undefined,
): CopyInput {
  return { ...(base ?? {}), ...(override ?? {}) };
}

type ProductInput = CreateSceneRenderJobInput["product"];

function mergeProduct(
  base: ProductInput | undefined,
  override: ProductInput | undefined,
): ProductInput {
  return { ...(base ?? {}), ...(override ?? {}) };
}

/**
 * preset scenes 배열에 overrides scenes를 sceneId 기준으로 merge.
 * override에 없는 씬은 preset 원본 그대로 유지.
 * override에만 있는 씬(sceneId 불일치)은 무시 (preset 구조 유지 우선).
 */
function mergeSceneArrayWithOverrides(
  preset: AdSceneSpec[],
  overrides: AdSceneSpec[],
): AdSceneSpec[] {
  const overrideMap = new Map<string, Partial<AdSceneSpec>>(
    overrides.map((s) => [s.sceneId, s]),
  );

  return preset.map((scene) => {
    const ov = overrideMap.get(scene.sceneId);
    if (!ov) return scene;
    return {
      ...scene,
      ...ov,
      // copy/product는 slot/zone 단위 merge
      copy: mergeCopy(scene.copy, ov.copy),
      product: mergeProduct(scene.product, ov.product),
      character: ov.character
        ? mergeCharacter(scene.character, ov.character)
        : scene.character,
    };
  });
}
