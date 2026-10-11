-- ── Brand Reference Images ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_reference_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  public_url  text NOT NULL,
  order_idx   int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_ref_images_brand_id ON brand_reference_images(brand_id);

-- ── Brand Profiles ─────────────────────────────────────────────────────────────
-- status: draft | active | archived
-- 3-layer: base_profile (Claude raw) + direction (user overlay) = refined_profile
CREATE TABLE IF NOT EXISTS brand_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  version          int  NOT NULL DEFAULT 1,
  status           text NOT NULL DEFAULT 'active',
  base_profile     jsonb NOT NULL,
  direction        jsonb NOT NULL DEFAULT '{}',
  refined_profile  jsonb NOT NULL,
  source_prompt    text,
  parent_id        uuid REFERENCES brand_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS brand_profiles_brand_version ON brand_profiles(brand_id, version);
CREATE INDEX IF NOT EXISTS brand_profiles_brand_id ON brand_profiles(brand_id);

-- ── Brand Concepts ─────────────────────────────────────────────────────────────
-- type: season | product_line | campaign | collection
CREATE TABLE IF NOT EXISTS brand_concepts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  base_profile_id  uuid NOT NULL REFERENCES brand_profiles(id),
  name             text NOT NULL,
  type             text NOT NULL DEFAULT 'campaign',
  concept_profile  jsonb NOT NULL,
  override_patch   jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_concepts_brand_id ON brand_concepts(brand_id);
