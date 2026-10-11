-- brand_hierarchy_patch.sql
-- 계층 구조 명확화 패치
--
-- 변경 사항:
--   1. brand_concepts: scope 컬럼 추가 + 제약 강화
--      - scope='product' 이면 product_id not null 강제
--      - scope='brand'   이면 product_id는 null
--   2. brand_image_jobs: concept_id 역할 명확화
--      - product_shot: concept_id not null 강제 (콘셉트 없이 생성 불가)
--      - product_id 컬럼 제거 → concept.product_id 에서 파생 (중복 제거)
--
-- ※ 멱등 설계: 여러 번 실행해도 안전함.

-- ─── 1. brand_concepts: scope 추가 ───────────────────────────────────────────

do $$ begin
  create type concept_scope as enum ('brand', 'product');
exception when duplicate_object then null;
end $$;

-- scope 컬럼 추가 (기존 행은 product_id 유무로 자동 채움)
alter table brand_concepts
  add column if not exists scope concept_scope not null default 'brand';

-- 기존 데이터 backfill: product_id 있으면 'product', 없으면 'brand'
update brand_concepts
  set scope = case when product_id is not null then 'product'::concept_scope
                   else 'brand'::concept_scope end
  where scope = 'brand';  -- default로 들어간 것만 보정

-- 제약: scope='product' 이면 product_id must not null
alter table brand_concepts
  drop constraint if exists chk_concept_scope_product_id;
alter table brand_concepts
  add constraint chk_concept_scope_product_id
    check (scope != 'product' or product_id is not null);

-- ─── 2. brand_image_jobs: product_shot → concept_id 필수 강제 ────────────────

-- product_shot은 반드시 콘셉트를 통해 생성 (concept_id not null 강제)
alter table brand_image_jobs
  drop constraint if exists chk_product_shot_concept;
alter table brand_image_jobs
  add constraint chk_product_shot_concept
    check (job_type != 'product_shot' or concept_id is not null);

-- product_id 컬럼은 concept.product_id 에서 파생 가능하므로 제거
-- (brand_image_jobs.product_id 는 중복 저장이었음)
-- 인덱스 먼저 제거 후 컬럼 삭제
drop index if exists idx_brand_image_jobs_product_id;
alter table brand_image_jobs
  drop column if exists product_id;
