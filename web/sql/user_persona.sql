-- KIRICAST: 유저당 1개 인플루언서 참조 (캐릭터 생성 시 상반신 후보 4장 중 선택 → 상반신 + T자 전신 저장)
-- 컨셉트 사진(화보) 생성 시 reference_image_url(상반신)을 fal.ai InstantID face_image_url로 사용

CREATE TABLE IF NOT EXISTS public.user_persona (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_image_url text,           -- 상반신샷 URL (유저가 4장 중 선택한 것). InstantID 참조용.
  reference_fullbody_image_url text,  -- 스펙에 따른 T자 전신샷 URL. 저장용.
  base_model text,                    -- 맞춤 베이스: 프리셋 키 또는 SDXL URL.
  lora_config jsonb DEFAULT '[]'::jsonb, -- LoRA 배열 [{ url, weight }, ...]. 인플루언서 미감.
  generation_prompt text,             -- 선택한 후보의 전체 프롬프트(꼬리말 포함).
  generation_seed bigint,              -- 선택한 후보의 시드.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_persona ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own user_persona" ON public.user_persona;
CREATE POLICY "Users can read own user_persona"
  ON public.user_persona FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own user_persona" ON public.user_persona;
CREATE POLICY "Users can update own user_persona"
  ON public.user_persona FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own user_persona" ON public.user_persona;
CREATE POLICY "Users can insert own user_persona"
  ON public.user_persona FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_persona IS 'One influencer reference per user. reference_image_url = upper-body shot (selected from 4 candidates); reference_fullbody_image_url = T-pose full-body per spec. Concept photo generation uses reference_image_url.';
COMMENT ON COLUMN public.user_persona.reference_image_url IS '상반신 참조 이미지 URL. 4장 후보 중 유저 선택분. InstantID face_image_url로 사용.';
COMMENT ON COLUMN public.user_persona.reference_fullbody_image_url IS 'T자 전신샷 URL. 스펙에 따라 생성·저장.';
COMMENT ON COLUMN public.user_persona.base_model IS '맞춤 베이스: default | asia_sdxl 또는 SDXL URL';
COMMENT ON COLUMN public.user_persona.lora_config IS 'LoRA 배열 [{ "url": "...", "weight": 0.8 }, ...]. 해당 인플루언서 미감 연출';
COMMENT ON COLUMN public.user_persona.generation_prompt IS '선택한 후보 이미지의 전체 프롬프트(꼬리말 포함)';
COMMENT ON COLUMN public.user_persona.generation_seed IS '선택한 후보 이미지의 시드';
