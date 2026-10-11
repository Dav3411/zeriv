/**
 * adTemplate.types.ts — API 응답 및 파이프라인 공유 타입.
 *
 * 입력(등록/수정) 타입은 adTemplate.schema.ts에서 Zod로 추론.
 * 이 파일은 응답 모양(AdTemplateResponse)과 pipeline snapshot을 정의한다.
 */

import type {
  TextSlotInput,
  ProductZoneInput,
  CharacterConstraintsInput,
  TransitionConfigInput,
  QualityMetaInput,
  AdTemplateAssetsInput,
} from "./adTemplate.schema";
import type { DbAdTemplate } from "./adTemplate.repository";

// 입력 타입과 동일 모양이지만 응답에서 재사용
export type TextSlot = TextSlotInput;
export type ProductZone = ProductZoneInput;
export type CharacterConstraints = CharacterConstraintsInput;
export type TransitionConfig = TransitionConfigInput;
export type QualityMeta = QualityMetaInput;
export type AdTemplateAssets = AdTemplateAssetsInput;

// ─── API 응답 ─────────────────────────────────────────────────────────────────

export interface AdTemplateResponse {
  id: string;
  templateCode: string;
  displayName: string;
  description: string;
  category: string;
  shotType: string;
  status: string;
  templateVersion: number;
  rejectionReason: string | null;
  durationSec: number;
  fps: number;
  frameCount: number;
  aspectRatio: string;
  width: number;
  height: number;
  assets: AdTemplateAssets;
  textSlots: TextSlot[];
  productZones: ProductZone[];
  characterConstraints: CharacterConstraints;
  transitionConfig: TransitionConfig;
  brandFitTags: string[];
  qualityMeta: QualityMeta;
  isPremium: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListAdTemplatesResponse {
  templates: AdTemplateResponse[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Pipeline snapshot ────────────────────────────────────────────────────────

/** Scene render pipeline이 사용하는 경량 snapshot. */
export interface AdTemplateSnapshot {
  templateId: string;
  templateCode: string;
  category: string;
  shotType: string;
  durationSec: number;
  fps: number;
  frameCount: number;
  width: number;
  height: number;
  poseDataUrl: string | null;
  faceSignalUrl: string | null;
  footContactUrl: string | null;
  personBboxTimelineUrl: string | null;
  audioHintUrl: string | null;
  /**
   * Body worker(MimicMotion)의 driving video URL.
   * templates/{code}/driving_video.mp4 또는 proxy_video_key에서 유도.
   * null이면 body worker가 pose_data_url(JSON keypoints) 기반으로 동작.
   */
  motionVideoUrl: string | null;
  textSlots: TextSlot[];
  productZones: ProductZone[];
  characterConstraints: CharacterConstraints;
  transitionConfig: TransitionConfig;
  brandFitTags: string[];
  templateVersion: number;
}

// ─── Row → Response mapper ────────────────────────────────────────────────────

const DEFAULT_QUALITY_META: QualityMeta = {
  qualityScore: null,
  poseQualityScore: null,
  faceQualityScore: null,
  lightingScore: null,
  usageCount: 0,
  avgRenderSuccessRate: null,
  knownIssues: [],
};

export function rowToAdTemplateResponse(row: DbAdTemplate): AdTemplateResponse {
  return {
    id: row.id,
    templateCode: row.template_code,
    displayName: row.display_name,
    description: row.description ?? "",
    category: row.category,
    shotType: row.shot_type,
    status: row.status,
    templateVersion: row.template_version,
    rejectionReason: row.rejection_reason ?? null,
    durationSec: Number(row.duration_sec),
    fps: Number(row.fps),
    frameCount: row.frame_count,
    aspectRatio: row.aspect_ratio,
    width: row.width,
    height: row.height,
    assets: {
      poseDataKey: row.pose_data_key,
      faceSignalKey: row.face_signal_key,
      footContactKey: row.foot_contact_key,
      personBboxTimelineKey: row.person_bbox_timeline_key,
      audioHintKey: row.audio_hint_key,
      thumbnailKey: row.thumbnail_key,
      proxyVideoKey: row.proxy_video_key,
    },
    textSlots: (row.text_slots as TextSlot[]) ?? [],
    productZones: (row.product_zones as ProductZone[]) ?? [],
    characterConstraints: (row.character_constraints as CharacterConstraints) ?? {},
    transitionConfig: (row.transition_config as TransitionConfig) ?? {},
    brandFitTags: row.brand_fit_tags ?? [],
    qualityMeta: ((row.quality_meta as QualityMeta) ?? DEFAULT_QUALITY_META),
    isPremium: row.is_premium,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
