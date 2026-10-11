-- assets 테이블에 model_id, product_id 컬럼 추가 (FK 포함)
-- ON DELETE SET NULL: 모델/제품이 삭제되어도 에셋 레코드는 유지

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS model_id   uuid REFERENCES models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;

-- 필터링 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS assets_model_id_idx   ON assets (model_id);
CREATE INDEX IF NOT EXISTS assets_product_id_idx ON assets (product_id);
