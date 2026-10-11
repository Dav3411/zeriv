-- influencers: canonical_c1_key / canonical_c2_key / canonical_c3_key 컬럼 추가
-- 기존 canonical_images JSONB에 저장된 값을 새 컬럼으로 마이그레이션.
--
-- canonical_images 구조: {"c1_key":"...", "c2_key":"...", "c3_key":"..."}

-- 1. 컬럼 추가
ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS canonical_c1_key text,
  ADD COLUMN IF NOT EXISTS canonical_c2_key text,
  ADD COLUMN IF NOT EXISTS canonical_c3_key text;

-- 2. 기존 canonical_images JSONB → 개별 컬럼으로 마이그레이션
UPDATE public.influencers
SET
  canonical_c1_key = canonical_images->>'c1_key',
  canonical_c2_key = canonical_images->>'c2_key',
  canonical_c3_key = canonical_images->>'c3_key'
WHERE
  canonical_images IS NOT NULL
  AND (
    canonical_c1_key IS NULL
    OR canonical_c2_key IS NULL
    OR canonical_c3_key IS NULL
  );

-- 3. 인덱스 (렌더 요청 시 캐릭터 조회 빈번)
CREATE INDEX IF NOT EXISTS idx_influencers_canonical_c1_key
  ON public.influencers (canonical_c1_key)
  WHERE canonical_c1_key IS NOT NULL;

COMMENT ON COLUMN public.influencers.canonical_c1_key IS 'R2 key: C1 정면 전신 (InstantID 생성). canonical_images.c1_key 미러.';
COMMENT ON COLUMN public.influencers.canonical_c2_key IS 'R2 key: C2 35도 회전 (InstantID 생성). canonical_images.c2_key 미러.';
COMMENT ON COLUMN public.influencers.canonical_c3_key IS 'R2 key: C3 한 팔 올림 (InstantID 생성). canonical_images.c3_key 미러.';
