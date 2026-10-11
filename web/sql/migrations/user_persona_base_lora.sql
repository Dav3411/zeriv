-- 인플루언서별 맞춤 Base Model + LoRA 배열 저장 (미감 연출용)

ALTER TABLE public.user_persona
  ADD COLUMN IF NOT EXISTS base_model text,
  ADD COLUMN IF NOT EXISTS lora_config jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_persona.base_model IS '맞춤 베이스/체크포인트: 프리셋 키(default, asia_sdxl) 또는 SDXL 모델 URL';
COMMENT ON COLUMN public.user_persona.lora_config IS 'LoRA 배열: [{ "url": "https://...", "weight": 0.8 }, ...]. 해당 인플루언서만의 미감 연출';
