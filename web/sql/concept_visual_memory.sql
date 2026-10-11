-- concept_visual_memory.sql
-- 콘셉트별 Visual Memory (승인된 렌더 이미지 레퍼런스 축적)
--
-- 목적:
--   콘셉트 단위로 "승인된 생성 결과"를 레퍼런스로 저장한다.
--   다음 생성 시 이 레퍼런스를 style anchor로 활용해 스타일 드리프트를 방지한다.
--
-- 테이블:
--   concept_approved_renders — 콘셉트별 승인된 렌더 이미지 (visual memory 항목)
--
-- 의존성:
--   brand_concepts (brand_profile_v1.sql)
--   brand_image_jobs (brand_image_v1.sql)
--   auth.users
--
-- ※ 멱등 설계

-- ─── concept_approved_renders ─────────────────────────────────────────────────
-- 유저가 "이 결과가 이 콘셉트의 기준이다"라고 승인한 렌더 이미지.
-- 한 콘셉트에 여러 장 저장 가능. 이후 생성 시 IP-Adapter / 스타일 앵커로 주입됨.
--
-- image_url         : 승인된 이미지 R2 CDN URL
-- image_r2_key      : R2 key (재사용/복제용)
-- source_job_id     : 이 이미지를 생성한 brand_image_jobs.id (nullable: 외부 업로드)
-- role              : 이 이미지가 어떤 목적의 레퍼런스인지
--   style_anchor    : 전체 스타일 기준 (색감/조도/무드)
--   composition_ref : 구도/레이아웃 기준
--   color_ref       : 색상 팔레트 기준
--   texture_ref     : 텍스처/마감 기준
--   product_ref     : 제품 합성 위치/크기 기준
-- is_primary        : 가장 대표적인 레퍼런스 (콘셉트당 role별 1개 권장)
-- snapshot          : 생성 당시 파라미터 스냅샷 (재현용)

create table if not exists concept_approved_renders (
  id             uuid    primary key default gen_random_uuid(),
  concept_id     uuid    not null references brand_concepts(id) on delete cascade,
  brand_id       uuid    not null references brands(id) on delete cascade,
  user_id        uuid    not null references auth.users(id) on delete cascade,

  image_url      text    not null,
  image_r2_key   text    not null,
  thumbnail_url  text,

  -- 생성 출처 (brand_image_jobs.id — 외부 업로드면 null)
  source_job_id  uuid    references brand_image_jobs(id) on delete set null,

  role           text    not null default 'style_anchor'
                 check (role in (
                   'style_anchor',
                   'composition_ref',
                   'color_ref',
                   'texture_ref',
                   'product_ref'
                 )),

  -- 콘셉트당 role별 1개가 primary
  is_primary     boolean not null default false,

  -- 이미지 메타 (IP-Adapter 주입 시 활용)
  width          integer,
  height         integer,

  -- 생성 파라미터 스냅샷 (재현 및 드리프트 감지용)
  -- { resolvedPrompt, templateCode, conceptProfile(일부), generationHints }
  snapshot       jsonb   not null default '{}',

  -- 승인 상태: draft(생성됨) → selected(승인) → rejected(반려)
  approval_status text    not null default 'draft'
                  check (approval_status in ('draft', 'selected', 'rejected')),

  -- 즐겨찾기 / 베스트 마크
  is_favorite    boolean not null default false,

  -- 승인자 메모
  note           text    check (char_length(note) <= 500),

  created_at     timestamptz not null default now()
);

create index if not exists idx_concept_approved_renders_concept_id
  on concept_approved_renders(concept_id);
create index if not exists idx_concept_approved_renders_brand_id
  on concept_approved_renders(brand_id);
-- primary 레퍼런스 빠른 조회
create index if not exists idx_concept_approved_renders_primary
  on concept_approved_renders(concept_id, role)
  where is_primary = true;

alter table concept_approved_renders enable row level security;

drop policy if exists "concept_approved_renders: owner access" on concept_approved_renders;
create policy "concept_approved_renders: owner access"
  on concept_approved_renders for all
  using (auth.uid() = user_id);

-- ─── is_primary 유니크 보장 함수 ──────────────────────────────────────────────
-- 같은 concept_id + role에서 is_primary=true는 1개만 허용.
-- 새 primary 지정 시 기존 primary를 자동으로 false로 전환.

create or replace function enforce_single_primary_render()
returns trigger language plpgsql as $$
begin
  if new.is_primary = true then
    update concept_approved_renders
       set is_primary = false
     where concept_id = new.concept_id
       and role       = new.role
       and id        != new.id
       and is_primary = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_single_primary_render on concept_approved_renders;
create trigger trg_single_primary_render
  before insert or update on concept_approved_renders
  for each row execute function enforce_single_primary_render();
