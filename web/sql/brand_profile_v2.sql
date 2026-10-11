-- brand_profile_v2.sql
-- 브랜드 스타일 시스템 리팩토링 마이그레이션
--
-- 변경 사항:
--   brand_profiles:
--     + name              — 사용자 지정 스타일 이름
--     + deleted_at        — 소프트 삭제 타임스탬프
--     + scope             — 'brand' | 'campaign' 구분
--     + concept_id        — 캠페인 스타일 시 연결된 컨셉 ID
--     + preview_image_urls — 스타일 프리뷰 썸네일 URL 배열
--
--   brand_concepts:
--     + campaign_profile_id — 캠페인 전용 스타일 ID
--
-- 의존성:
--   brand_profile_v1.sql (brand_profiles, brand_concepts 테이블)
--
-- ※ 멱등 설계: 여러 번 실행해도 안전함.

-- ─── brand_profiles 컬럼 추가 ─────────────────────────────────────────────────

-- 사용자 지정 스타일 이름 (null이면 UI에서 v{version}으로 표시)
alter table brand_profiles
  add column if not exists name text default null;

-- 소프트 삭제 (null = 활성, non-null = 삭제된 시간)
alter table brand_profiles
  add column if not exists deleted_at timestamptz default null;

-- 스타일 범위: 'brand' = 브랜드 기본, 'campaign' = 캠페인 전용
alter table brand_profiles
  add column if not exists scope text not null default 'brand';

-- scope 컬럼 check constraint (멱등)
do $$ begin
  alter table brand_profiles
    add constraint chk_brand_profiles_scope
    check (scope in ('brand', 'campaign'));
exception when duplicate_object then null;
end $$;

-- 캠페인 스타일일 때 연결된 컨셉 ID
alter table brand_profiles
  add column if not exists concept_id uuid references brand_concepts(id) on delete set null default null;

-- 스타일 프리뷰 이미지 URL 배열
alter table brand_profiles
  add column if not exists preview_image_urls jsonb not null default '[]';

-- ─── brand_profiles 인덱스 추가 ──────────────────────────────────────────────

-- 삭제되지 않은 스타일만 조회 (가장 빈번한 쿼리 패턴)
create index if not exists idx_brand_profiles_brand_not_deleted
  on brand_profiles(brand_id, version desc)
  where deleted_at is null;

-- 캠페인 스타일 조회
create index if not exists idx_brand_profiles_concept_id
  on brand_profiles(concept_id)
  where concept_id is not null;

-- scope별 조회
create index if not exists idx_brand_profiles_brand_scope
  on brand_profiles(brand_id, scope)
  where deleted_at is null;

-- ─── brand_concepts 컬럼 추가 ─────────────────────────────────────────────────

-- 캠페인 전용 스타일 ID (null이면 기존 동작: 브랜드 활성 스타일 + override_patch)
alter table brand_concepts
  add column if not exists campaign_profile_id uuid
    references brand_profiles(id) on delete set null default null;

-- 캠페인 스타일 조회 인덱스
create index if not exists idx_brand_concepts_campaign_profile
  on brand_concepts(campaign_profile_id)
  where campaign_profile_id is not null;
