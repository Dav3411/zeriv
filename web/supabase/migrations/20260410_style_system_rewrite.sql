-- Style System Rewrite — Phase 1
-- 2026-04-10
-- styles 테이블 신규 + brands 컬럼 확장 + brand_image_jobs 수정

-- ────────────────────────────────────────────────
-- 0. updated_at 자동 갱신 트리거 함수
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────
-- 1. styles 테이블
-- ────────────────────────────────────────────────
CREATE TYPE style_type   AS ENUM ('custom', 'brand_recommended', 'preset', 'variant');
CREATE TYPE style_status AS ENUM ('active', 'archived');

CREATE TABLE IF NOT EXISTS styles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  name             text NOT NULL,
  type             style_type   NOT NULL DEFAULT 'custom',
  color_palette    jsonb NOT NULL DEFAULT '{}',
  form_language    jsonb NOT NULL DEFAULT '{}',
  texture          jsonb NOT NULL DEFAULT '{}',
  composition      jsonb NOT NULL DEFAULT '{}',
  lighting         jsonb NOT NULL DEFAULT '{}',
  mood_keywords    text[] NOT NULL DEFAULT '{}',
  example_images   text[] NOT NULL DEFAULT '{}',
  parent_style_id  uuid REFERENCES styles(id) ON DELETE SET NULL,
  status           style_status NOT NULL DEFAULT 'active',
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_styles_brand_id        ON styles(brand_id);
CREATE INDEX IF NOT EXISTS idx_styles_parent_style_id  ON styles(parent_style_id);
CREATE INDEX IF NOT EXISTS idx_styles_brand_status     ON styles(brand_id, status);

-- updated_at 트리거
CREATE TRIGGER set_styles_updated_at
  BEFORE UPDATE ON styles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view styles of own brands"
  ON styles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = styles.brand_id
        AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert styles for own brands"
  ON styles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = styles.brand_id
        AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update styles of own brands"
  ON styles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = styles.brand_id
        AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete styles of own brands"
  ON styles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = styles.brand_id
        AND brands.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────
-- 2. brands 테이블 컬럼 추가
-- ────────────────────────────────────────────────
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS keywords         text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prohibited_rules text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reference_images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS color_palette    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mood_summary     text,
  ADD COLUMN IF NOT EXISTS active_style_id  uuid REFERENCES styles(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────
-- 3. brand_image_jobs 수정
-- ────────────────────────────────────────────────
ALTER TABLE brand_image_jobs
  DROP CONSTRAINT IF EXISTS chk_product_shot_concept;

ALTER TABLE brand_image_jobs
  ADD COLUMN IF NOT EXISTS style_id uuid REFERENCES styles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brand_image_jobs_style_id
  ON brand_image_jobs(style_id)
  WHERE style_id IS NOT NULL;
