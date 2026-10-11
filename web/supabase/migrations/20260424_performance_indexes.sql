-- Performance indexes — 2026-04-24
-- Disk I/O 최적화: brand_id / updated_at 기반 조회 패턴 인덱스 추가
--
-- CONCURRENTLY: 테이블 잠금 없이 온라인으로 생성.
-- Supabase SQL Editor에서는 CONCURRENTLY를 지원하지 않음.
-- 반드시 psql 또는 마이그레이션 CLI(supabase db push)로 실행할 것.
--
-- 기존 인덱스 중복 확인:
--   jobs    : idx_jobs_user_id, idx_jobs_status, idx_jobs_created_at,
--             idx_jobs_source_status, jobs_priority_created_idx
--   assets  : assets_model_id_idx, assets_product_id_idx, assets_style_id_idx
--   models  : (brand_id 인덱스 없음)
--   → 아래 4개 인덱스는 모두 신규.

-- ── 1. jobs(brand_id, created_at DESC) — brand_id가 있는 잡 조회 ─────────────
-- brand 대시보드/studio 페이지에서 특정 브랜드의 최신 잡 목록을 가져올 때 사용.
-- brand_id IS NOT NULL partial: brand_id 없는 레거시/내부 잡을 인덱스에서 제외.
create index concurrently if not exists jobs_brand_id_created_at_idx
  on public.jobs (brand_id, created_at desc)
  where brand_id is not null;

-- ── 2. jobs(updated_at DESC) — stale 잡 감지 및 폴링 ──────────────────────────
-- worker.mjs / pipeline-recovery에서 최근 업데이트된 잡을 스캔할 때 사용.
create index concurrently if not exists jobs_updated_at_idx
  on public.jobs (updated_at desc);

-- ── 3. assets(brand_id, created_at DESC) — 브랜드 에셋 갤러리 조회 ─────────────
-- /api/renders, studio 갤러리에서 brand_id 기준 최신 에셋 목록을 가져올 때 사용.
create index concurrently if not exists assets_brand_id_created_at_idx
  on public.assets (brand_id, created_at desc);

-- ── 4. models(brand_id) — 브랜드에 연결된 모델 조회 ───────────────────────────
-- /api/brands/[id]/models에서 brand_id로 모델 목록·개수를 조회할 때 사용.
create index concurrently if not exists models_brand_id_idx
  on public.models (brand_id);
