// 퀵 썸네일 페이지 (목록형 멀티 이미지 UX)에서 공유하는 타입 정의.
// QuickItem은 한 행 = 한 이미지의 모든 입력/상태/결과를 담는 단일 진실 소스.

export type FormatKey = "mood" | "model" | "cutout";
export type ItemStatus = "idle" | "generating" | "succeeded" | "failed";

export interface QuickItem {
  /** crypto.randomUUID() 로 생성한 안정 ID — 폴링/업데이트 추적의 키. */
  id: string;
  /** 사용자가 업로드한 원본 파일. cutout 파이프라인 입력으로도 사용. */
  file: File;
  /** URL.createObjectURL(file) — 컴포넌트 unmount 또는 항목 삭제 시 revoke 필요. */
  previewUrl: string;
  /** null 이면 UI에서 "선택해주세요"로 표시. 추가 시 기본 "mood"로 prefill. */
  format: FormatKey | null;
  /** model 포맷 전용. 기본 "female". */
  gender: "male" | "female";
  /** cutout 포맷 전용. 1~30. 기본 1. */
  count: number;
  status: ItemStatus;
  /** 0~100. mood/model 진행률, cutout 은 단계별 가짜 진행률. */
  progress: number;
  /** mood/model 의 server job ID. cutout 은 항상 null. */
  jobId: string | null;
  /** mood/model 결과 이미지 URL (서버 서명 URL). */
  resultUrl: string | null;
  /** mood/model 결과 asset_id (서버에서 생성한 자산 ID). 후속 다운로드/저장 식별자. */
  resultAssetId: string | null;
  /** cutout 파이프라인의 최종 PNG Blob — bulk zip 에 그대로 첨부. */
  cutoutResultBlob: Blob | null;
  /** URL.createObjectURL(cutoutResultBlob) — 미리보기/단일 다운로드용. revoke 필요. */
  cutoutResultUrl: string | null;
  /** 현재 resultUrl / cutoutResultUrl 을 생성한 포맷. 포맷 변경 시 결과 표시 여부 판단용. */
  resultFormat: FormatKey | null;
  error: string | null;
}
