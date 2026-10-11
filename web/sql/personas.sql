-- KIRICAST: AI 인플루언서
-- 유저가 생성한 AI 인플루언서. face master(face_master_key) + 생성에 사용된 모델/LoRA 설정 저장.
-- 파이프라인:
--   Step 1: Nano Banana 2(text2img) → SDXL img2img + LoRA (denoising 0.45) × 4 face master candidates
--   Step 2: 유저가 1장 선택 → face_master_key 저장
--   Step 3: InstantID × 3 → canonical set (C1 정면/C2 3/4회전/C3 팔올림) → canonical_images 저장

-- 기존 테이블 삭제 (처음 생성 시):
-- DROP TABLE IF EXISTS public.personas CASCADE;
-- DROP TABLE IF EXISTS public.influencers CASCADE;

CREATE TABLE IF NOT EXISTS public.influencers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,

  -- 유저 선택 옵션 (5개 레이어 selections JSON으로 저장)
  preset_type   text NOT NULL DEFAULT 'custom' CHECK (preset_type IN ('k_beauty', '2_5d_ani', 'custom')),
  selections    jsonb DEFAULT '{}'::jsonb,  -- { gender, age_range, face_type, hair_style, style_vibe }

  -- face master (후보 4장 중 유저가 선택한 1장 → R2 key)
  face_master_key text,

  -- 9구도 페이스 시트 (Gemini 생성, face_master + face_sheet.png 템플릿 → R2 key)
  face_sheet_key text,

  -- 이미지 생성에 사용된 모델/LoRA 설정 (재현·렌더 일관성 유지용)
  base_model    text,                       -- 프리셋 키 또는 SDXL URL (R2)
  lora_config   jsonb DEFAULT '[]'::jsonb,  -- [{ url, weight }, ...] 1~3개
  generation_prompt text,                   -- 선택된 face master의 전체 프롬프트
  generation_seed   bigint,                 -- 선택된 face master의 시드

  -- Canonical Set (C1/C2/C3) — InstantID로 생성한 전신 정보 샷 3장 R2 key
  -- { c1_key: "...", c2_key: "...", c3_key: "..." }
  canonical_images jsonb DEFAULT NULL,

  -- 상태 ('ready' = canonical set까지 완료)
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'done', 'failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_influencers_user_id    ON public.influencers(user_id);
CREATE INDEX IF NOT EXISTS idx_influencers_updated_at ON public.influencers(updated_at DESC);

ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own influencers" ON public.influencers;
CREATE POLICY "Users can manage own influencers"
  ON public.influencers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.influencers IS 'AI influencer. face_master_key = R2 key for the chosen face master (1 of 4 candidates). base_model + lora_config store the generation config for rendering consistency.';
COMMENT ON COLUMN public.influencers.selections IS '5개 레이어 유저 선택값. {"gender":"female","age_range":"early-20s","face_type":"cat","hair_style":"wolf-cut","style_vibe":"chic"}';
COMMENT ON COLUMN public.influencers.face_master_key IS 'face master 4장 중 유저가 선택한 이미지의 R2 key. InstantID 렌더 시 face_image_url로 사용.';
COMMENT ON COLUMN public.influencers.base_model IS 'SDXL img2img에 사용된 베이스 모델 (프리셋 키 또는 R2 URL)';
COMMENT ON COLUMN public.influencers.lora_config IS 'face master 생성 시 적용된 LoRA 배열 [{"url":"...","weight":0.8},...]';
COMMENT ON COLUMN public.influencers.generation_prompt IS '선택된 face master의 전체 프롬프트 (base_prompt + micro-parameter suffix)';
COMMENT ON COLUMN public.influencers.generation_seed IS '선택된 face master의 랜덤 시드';
COMMENT ON COLUMN public.influencers.canonical_images IS 'Canonical set R2 keys. {"c1_key":"...","c2_key":"...","c3_key":"..."}. C1=정면전신 C2=35도회전 C3=팔올림. InstantID로 생성, face_master_key 확정 후 채워짐.';
