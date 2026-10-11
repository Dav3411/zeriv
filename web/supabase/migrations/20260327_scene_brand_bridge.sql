-- 20260327_scene_brand_bridge.sql
-- scene_render_jobs ↔ generation_sessions 연결 브릿지
-- 브랜드 프로필 기반 SceneRender 생성 흐름 지원

-- ── 1. scene_render_jobs에 generation_session_id 추가 ──────────────────────────
alter table scene_render_jobs
  add column if not exists generation_session_id uuid
    references generation_sessions(id) on delete set null;

-- ── 2. scene_render_jobs에 brand_profile_snapshot 추가 ────────────────────────
-- SceneRender 생성 시점의 브랜드 프로필 스냅샷 (optional)
alter table scene_render_jobs
  add column if not exists brand_profile_snapshot jsonb;

-- ── 3. 인덱스 ──────────────────────────────────────────────────────────────────
create index if not exists scene_render_jobs_generation_session_id_idx
  on scene_render_jobs(generation_session_id)
  where generation_session_id is not null;

-- ── 실행 방법 ──────────────────────────────────────────────────────────────────
-- Supabase SQL Editor에서 직접 실행
-- 또는: supabase db push (local dev)
