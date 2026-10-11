-- ============================================================================
-- reference_gallery — 참조 이미지 갤러리
-- user_id IS NULL → admin/global (모든 사용자에게 노출)
-- user_id = uuid  → 해당 사용자 전용
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reference_gallery (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_type text        NOT NULL CHECK (pipeline_type IN (
                  'photo_remix', 'imagine', 'object', 'product'
                )),
  image_key     text        NOT NULL,
  label         text        NOT NULL DEFAULT '',
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ref_gallery_user_pipeline
  ON public.reference_gallery (user_id, pipeline_type);

CREATE INDEX IF NOT EXISTS idx_ref_gallery_admin_pipeline
  ON public.reference_gallery (pipeline_type)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ref_gallery_created
  ON public.reference_gallery (created_at DESC);

-- RLS
ALTER TABLE public.reference_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY ref_gallery_select ON public.reference_gallery
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY ref_gallery_insert ON public.reference_gallery
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY ref_gallery_update ON public.reference_gallery
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY ref_gallery_delete ON public.reference_gallery
  FOR DELETE USING (user_id = auth.uid());

-- updated_at trigger (reuse existing function)
CREATE TRIGGER set_ref_gallery_updated_at
  BEFORE UPDATE ON public.reference_gallery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
