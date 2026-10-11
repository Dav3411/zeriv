ALTER TABLE styles
  ADD COLUMN IF NOT EXISTS is_template  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category     text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text NOT NULL DEFAULT '4:5';

CREATE INDEX IF NOT EXISTS idx_styles_is_template ON styles (is_template)
  WHERE is_template = true;

-- 시스템 브랜드 (고정 UUID) — FK 트리거 우회
SET session_replication_role = replica;

INSERT INTO brands (id, name, user_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Zeriv System',
  '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (id) DO NOTHING;

SET session_replication_role = DEFAULT;

-- 템플릿 공개 읽기 RLS
DROP POLICY IF EXISTS "template_styles_public_read" ON styles;

CREATE POLICY "template_styles_public_read" ON styles
  FOR SELECT
  TO anon, authenticated
  USING (is_template = true AND status = 'active');
