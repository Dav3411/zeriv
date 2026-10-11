-- ============================================================================
-- brand_style_saves: 브랜드가 저장한(즐겨찾기한) 템플릿 스타일 junction table
--
-- 배경
--   탐색(Explore) 페이지에서 사용자가 템플릿 스타일을 "저장"하면, 기존에는
--   styles 테이블에 전체 복사본을 INSERT 했다. 같은 템플릿을 N개 브랜드가
--   저장하면 동일 데이터가 N번 중복 저장되는 문제가 있었다.
--
--   이 마이그레이션은 (brand_id, style_id) 참조 모델로 전환한다.
--   - 신규 저장: brand_style_saves에 1행 INSERT
--   - 기존 복사본: junction에 백필 후 styles 복사본은 status='archived'로 보존
--   - active_style_id가 복사본을 가리키면 원본 템플릿으로 교정
--
-- 주의
--   styles 복사본을 DELETE하지 않고 archived로 두는 이유는
--   render_jobs/assets에서 style_id를 FK로 참조할 가능성을 고려한 것이다.
--   FK 제약이 ON DELETE CASCADE인지에 관계없이 안전한 경로를 택한다.
-- ============================================================================

-- 1) junction table
create table if not exists brand_style_saves (
  brand_id   uuid not null references brands(id) on delete cascade,
  style_id   uuid not null references styles(id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (brand_id, style_id)
);

create index if not exists idx_brand_style_saves_style_id
  on brand_style_saves(style_id);

alter table brand_style_saves enable row level security;

-- 정책: 브랜드 access 권한이 있는 사용자(legacy owner + organization member)는
--      해당 브랜드의 저장 목록을 자유롭게 관리할 수 있다.
--      user_can_write_brand는 owner/admin/member 모두 허용한다 (viewer 제외).
--      읽기는 user_can_access_brand(read-only viewer 포함)를 사용한다.
drop policy if exists "brand_style_saves_select" on brand_style_saves;
create policy "brand_style_saves_select"
  on brand_style_saves for select
  using (public.user_can_access_brand(brand_id));

drop policy if exists "brand_style_saves_write" on brand_style_saves;
create policy "brand_style_saves_write"
  on brand_style_saves for all
  using (public.user_can_write_brand(brand_id))
  with check (public.user_can_write_brand(brand_id));

-- ============================================================================
-- 2) 백필: 기존에 템플릿 복사본으로 만들어진 스타일을 junction으로 옮긴다.
--    조건:
--      - s.is_template = false  (사용자 측 복사본)
--      - s.parent_style_id IS NOT NULL
--      - s.parent_style_id가 가리키는 부모 t.is_template = true
--      - s.status = 'active' 만 대상 (이미 archive된 것은 의도된 삭제로 간주)
--    DISTINCT (brand_id, style_id)로 중복 제거.
-- ============================================================================
insert into brand_style_saves (brand_id, style_id, saved_at)
select distinct s.brand_id, s.parent_style_id, s.created_at
from styles s
inner join styles t on t.id = s.parent_style_id
where t.is_template = true
  and s.is_template = false
  and s.parent_style_id is not null
  and s.status = 'active'
on conflict (brand_id, style_id) do nothing;

-- ============================================================================
-- 3) brands.active_style_id가 복사본을 가리키면 원본 템플릿으로 교정.
--    이후 코드 변경으로 active_style_id에는 templateId 자체가 들어가게 된다.
-- ============================================================================
update brands b
set active_style_id = s.parent_style_id
from styles s
inner join styles t on t.id = s.parent_style_id
where b.active_style_id = s.id
  and s.is_template = false
  and t.is_template = true;

-- ============================================================================
-- 4) 복사본 아카이브 (데이터 보존, status만 변경).
--    DELETE를 쓰지 않는 이유는 render_jobs.style_id 등 FK 참조 가능성 때문.
-- ============================================================================
update styles s
set status = 'archived'
from styles t
where s.parent_style_id = t.id
  and t.is_template = true
  and s.is_template = false
  and s.status = 'active';
