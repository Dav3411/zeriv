import { getR2PublicUrl } from "@/lib/r2";

/**
 * Persona(model) 응답 직전 R2 key → public URL 변환.
 *
 * DB에는 face/sheet 이미지가 R2 key 형태로 저장된다 (face_master_key, face_sheet_key).
 * 클라이언트에는 *_url 필드로 노출하며, GET·POST·PATCH 응답 모두 동일한 모양을
 * 가져야 한다. 본 헬퍼는 입력 객체를 그대로 두고 변환된 *_url 필드를 덧붙인다.
 *
 * 키가 null/undefined인 필드는 *_url 도 null로 명시한다 (클라이언트가 항상
 * 동일한 키 셋을 보장받도록).
 */
export type PersonaUrlInput = {
  face_master_key?: string | null;
  face_sheet_key?: string | null;
};

export type PersonaUrlFields = {
  face_image_url: string | null;
  face_sheet_url: string | null;
};

export async function resolveModelUrls<T extends PersonaUrlInput>(
  model: T,
): Promise<T & PersonaUrlFields> {
  const face_image_url = model.face_master_key
    ? await getR2PublicUrl(model.face_master_key)
    : null;
  const face_sheet_url = model.face_sheet_key
    ? await getR2PublicUrl(model.face_sheet_key)
    : null;
  return { ...model, face_image_url, face_sheet_url };
}
