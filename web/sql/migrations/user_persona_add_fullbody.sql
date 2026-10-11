-- Add T-pose full-body reference URL to user_persona (run after user_persona.sql on existing DBs)

ALTER TABLE public.user_persona
  ADD COLUMN IF NOT EXISTS reference_fullbody_image_url text;

COMMENT ON COLUMN public.user_persona.reference_image_url IS '상반신 참조 이미지 URL. 4장 후보 중 유저 선택분. InstantID face_image_url로 사용.';
COMMENT ON COLUMN public.user_persona.reference_fullbody_image_url IS 'T자 전신샷 URL. 스펙에 따라 생성·저장.';
