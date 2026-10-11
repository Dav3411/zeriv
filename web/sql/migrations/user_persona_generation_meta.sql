-- 유저가 4장 중 선택한 이미지의 생성 메타 저장

ALTER TABLE public.user_persona
  ADD COLUMN IF NOT EXISTS generation_prompt text,
  ADD COLUMN IF NOT EXISTS generation_seed bigint;

COMMENT ON COLUMN public.user_persona.generation_prompt IS '선택한 후보 이미지의 전체 프롬프트(꼬리말 포함)';
COMMENT ON COLUMN public.user_persona.generation_seed IS '선택한 후보 이미지의 시드';
