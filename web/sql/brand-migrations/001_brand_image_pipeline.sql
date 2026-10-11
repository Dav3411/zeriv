-- ============================================================
-- 001_brand_image_pipeline.sql
-- 브랜드 이미지 파이프라인 초기 마이그레이션
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 → Run
--
-- 순서대로 실행되며 IF NOT EXISTS 조건으로 멱등(idempotent) 보장.
-- ============================================================


-- ① brands 컬럼 추가 ─────────────────────────────────────────
--   active_profile_id : 현재 콘셉트 생성 기준 프로필 버전 FK
--   preferred_template_ids : 브랜드별 즐겨찾기 템플릿 UUID 배열

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS active_profile_id uuid REFERENCES brand_profiles(id),
  ADD COLUMN IF NOT EXISTS preferred_template_ids uuid[] DEFAULT '{}';


-- ② brand_concepts 확장 (캠페인·시즌 메타) ────────────────────
--   concept_meta JSONB 구조:
--   {
--     "objective":       "awareness" | "conversion" | "retention" | "engagement",
--     "phase":           "planning" | "generating" | "live" | "ended",
--     "start_date":      "2025-06-01",
--     "end_date":        "2025-08-31",
--     "target_audience": { "age_range": [18,35], "genders": ["female"], "note": "..." },
--     "budget_note":     "자유 메모"
--   }

ALTER TABLE brand_concepts
  ADD COLUMN IF NOT EXISTS concept_meta jsonb;


-- ③ image_templates 사용 추적 ─────────────────────────────────
--   usage_count  : 이 템플릿으로 completed 잡이 생성된 횟수
--   last_used_at : 마지막으로 사용된 시각

ALTER TABLE image_templates
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;


-- ④ 인덱스 ──────────────────────────────────────────────────

-- 콘셉트 목록 탭별 필터 (type + status)
CREATE INDEX IF NOT EXISTS idx_brand_concepts_type
  ON brand_concepts(brand_id, type, status);

-- 캠페인 phase 필터 (type=campaign|season일 때)
CREATE INDEX IF NOT EXISTS idx_brand_concepts_phase
  ON brand_concepts((concept_meta->>'phase'))
  WHERE type IN ('campaign', 'season');

-- 이미지 잡 히스토리 (brand + status)
CREATE INDEX IF NOT EXISTS idx_brand_image_jobs_brand_status
  ON brand_image_jobs(brand_id, status);

-- 이미지 잡 → 콘셉트 역방향 조회
CREATE INDEX IF NOT EXISTS idx_brand_image_jobs_concept
  ON brand_image_jobs(concept_id)
  WHERE concept_id IS NOT NULL;

-- Visual Memory 승인 상태별 조회
CREATE INDEX IF NOT EXISTS idx_concept_approved_renders_concept
  ON concept_approved_renders(concept_id, approval_status);
