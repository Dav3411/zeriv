-- assets 테이블에 style_id 컬럼 추가 (FK 포함)
-- ON DELETE SET NULL: 스타일이 삭제되어도 에셋 레코드는 유지

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS style_id uuid REFERENCES styles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assets_style_id_idx ON assets (style_id);

-- 기존 에셋 백필: jobs.payload에서 style_id, model_id, product_id 채우기
UPDATE assets a
SET
  style_id   = COALESCE(a.style_id,   (j.payload->>'style_id')::uuid),
  model_id   = COALESCE(a.model_id,   (j.payload->>'influencer_id')::uuid),
  product_id = COALESCE(a.product_id, (j.payload->>'product_id')::uuid)
FROM jobs j
WHERE a.job_id = j.id
  AND j.payload IS NOT NULL
  AND (
    a.style_id   IS NULL
    OR a.model_id   IS NULL
    OR a.product_id IS NULL
  );
