ALTER TABLE styles
  ADD COLUMN IF NOT EXISTS scene         jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prop_keywords text[] NOT NULL DEFAULT '{}';
