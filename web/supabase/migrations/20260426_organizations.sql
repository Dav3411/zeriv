-- Zeriv Organization Architecture — Phase 1
-- 2026-04-26
--
-- Goal:
--   유저(또는 결제 주체) 단위의 "워크스페이스" 개념인 organizations를 도입.
--   기존에는 brand 단위로 구독·한도가 묶여 있었으나, 이제 한 organization이
--   여러 brand를 소유하고 모든 한도(생성/스타일/모델/멤버)를 풀(pool)로 공유.
--
-- Strategy:
--   1) organizations / organization_members 신규 테이블
--   2) 기존 brand_members → organization_members 이관 (멤버는 org 단위)
--   3) 기존 user당 1개 organization 자동 생성 (각 user는 자기 org의 owner)
--   4) brands.organization_id, subscriptions.organization_id,
--      usage_counters.organization_id, portone_orders.organization_id 추가
--      → 기존 brand_id 컬럼은 유지 (B7 별도 PR에서 드롭)
--   5) subscriptions.brand_id NOT NULL/UNIQUE 모두 드롭 (B1)
--   6) increment_org_generation_count RPC 추가 (B4)
--   7) plan_rank 함수: 한 user의 여러 org 중 어느 plan을 적용할지 결정용 헬퍼
--
-- Idempotency:
--   모든 DDL은 IF NOT EXISTS / DO blocks로 재실행 안전.
--   데이터 이관도 ON CONFLICT DO NOTHING.

-- ────────────────────────────────────────────────────────────────────────
-- 1. organizations 테이블
-- ────────────────────────────────────────────────────────────────────────
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  -- 표시 이름 (사용자가 변경 가능). user 기본 org는 email or 'My Organization'
  name        text not null default 'My Organization',
  -- 결제·소유권 단위 — auth.users(id) 1:1 보장 아님 (유저당 다중 org 가능).
  -- NULL은 허용하지 않음: 모든 org는 명시적 owner를 가져야 함.
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists organizations_owner_id_idx on organizations(owner_id);

alter table organizations enable row level security;

drop policy if exists "service role only" on organizations;
create policy "service role only" on organizations using (false);

-- ────────────────────────────────────────────────────────────────────────
-- 2. organization_members 테이블
-- ────────────────────────────────────────────────────────────────────────
-- 한 user는 여러 org에 속할 수 있다. 각 멤버십은 role('owner'|'admin'|'member').
-- owner는 organizations.owner_id와 동일하지만 일관성을 위해 row도 유지.
create table if not exists organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner','admin','member')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_org_id_idx
  on organization_members(organization_id);
create index if not exists organization_members_user_id_idx
  on organization_members(user_id);

alter table organization_members enable row level security;

drop policy if exists "service role only" on organization_members;
create policy "service role only" on organization_members using (false);

-- ────────────────────────────────────────────────────────────────────────
-- 3. 기존 user 단위 organizations 자동 생성
-- ────────────────────────────────────────────────────────────────────────
-- brands.user_id (모든 brand owner)와 brand_members.user_id 합집합으로
-- "활성 user" 셋을 만들고, 각 user에 대해 organization을 1개 생성.
--
-- 데이터 이관 후에는 brands.organization_id는 brand owner의 default org를 가리킨다.
do $$
begin
  -- 모든 brand owner와 brand member를 조합해 user 셋 추출
  -- 단, auth.users에 실제로 존재하는 유저만 (FK 위반 방어)
  -- 시스템/테스트용 더미 user_id (예: '00000000-0000-0000-0000-000000000000')는 자동으로 제외됨
  insert into organizations (owner_id, name)
  select distinct u.user_id, 'My Organization'
  from (
    select user_id from brands where user_id is not null
    union
    select user_id from brand_members where user_id is not null
  ) u
  where exists (
    select 1 from auth.users au where au.id = u.user_id
  )
  and not exists (
    select 1 from organizations o where o.owner_id = u.user_id
  );
end$$;

-- 각 organization에 owner row를 organization_members에 추가
insert into organization_members (organization_id, user_id, role)
select o.id, o.owner_id, 'owner'
from organizations o
on conflict (organization_id, user_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- 4. brand_members → organization_members 데이터 통합
-- ────────────────────────────────────────────────────────────────────────
-- 기존 brand_members 멤버십을 brand의 owner organization 기준으로 옮긴다.
-- (한 user가 여러 brand에 멤버였더라도 owner의 org가 동일하면 단일 row로 통합)
-- B2: brand_members가 없는 환경에서도 안전하도록 to_regclass 가드.
do $$
begin
  if to_regclass('public.brand_members') is not null then
    insert into organization_members (organization_id, user_id, role)
    select distinct o.id, bm.user_id,
           case when bm.role = 'owner' then 'owner' else 'member' end
    from brand_members bm
    join brands b on b.id = bm.brand_id
    join organizations o on o.owner_id = b.user_id
    where bm.user_id is not null
      and exists (select 1 from auth.users au where au.id = bm.user_id)
    on conflict (organization_id, user_id) do nothing;
  end if;
end$$;

-- ────────────────────────────────────────────────────────────────────────
-- 5. brands.organization_id 추가 + 데이터 이관
-- ────────────────────────────────────────────────────────────────────────
alter table brands
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

create index if not exists brands_organization_id_idx on brands(organization_id);

-- 기존 brand → owner의 organization 매핑
update brands b
set organization_id = o.id
from organizations o
where b.organization_id is null
  and o.owner_id = b.user_id;

-- ────────────────────────────────────────────────────────────────────────
-- 6. subscriptions.organization_id 추가 + 데이터 이관 + brand_id 제약 드롭
-- ────────────────────────────────────────────────────────────────────────
alter table subscriptions
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

create index if not exists subscriptions_organization_id_idx
  on subscriptions(organization_id);

-- 기존 brand_id 기반 구독을 brand의 organization으로 매핑
update subscriptions s
set organization_id = b.organization_id
from brands b
where s.organization_id is null
  and s.brand_id = b.id
  and b.organization_id is not null;

-- B1: subscriptions.brand_id의 NOT NULL/UNIQUE/active partial unique 제약 드롭
-- (subscriptions는 이제 organization 단위로 1개만 활성)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions'
      and column_name = 'brand_id' and is_nullable = 'NO'
  ) then
    alter table subscriptions alter column brand_id drop not null;
  end if;
end$$;

-- 기존 인라인 UNIQUE 제약(컬럼 정의에 unique) 드롭 — 이름이 환경에 따라 다르므로 catalog 조회로
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'subscriptions'
      and c.contype = 'u'
      and c.conkey = (
        select array_agg(a.attnum order by a.attnum)
        from pg_attribute a
        where a.attrelid = t.oid and a.attname = 'brand_id'
      )
  loop
    execute format('alter table subscriptions drop constraint %I', r.conname);
  end loop;
end$$;

-- 기존 partial unique index (subscriptions_brand_active 등) 드롭
drop index if exists subscriptions_brand_active;

-- 신규: organization 단위 active 구독 unique
create unique index if not exists subscriptions_organization_active
  on subscriptions(organization_id)
  where status in ('active','trialing','past_due');

-- ────────────────────────────────────────────────────────────────────────
-- 7. usage_counters.organization_id 추가 + B6 단일 SoT 전환
-- ────────────────────────────────────────────────────────────────────────
-- usage_counters는 (brand_id, year_month) PK였다. 이제 organization 단위.
-- B6: org 카운터를 단일 source of truth로 한다.
-- 기존 brand별 counter를 org로 합산 이관.

-- 운영 DB에 usage_counters가 없을 수 있어 안전하게 생성 (코드는 이미 사용 중)
create table if not exists usage_counters (
  brand_id    uuid references brands(id) on delete cascade,
  year_month  text not null,
  generations int  not null default 0,
  primary key (brand_id, year_month)
);

alter table usage_counters
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

create index if not exists usage_counters_organization_year_month_idx
  on usage_counters(organization_id, year_month);

-- brand_id에 해당하는 organization_id를 채워 넣기
update usage_counters uc
set organization_id = b.organization_id
from brands b
where uc.organization_id is null
  and uc.brand_id = b.id
  and b.organization_id is not null;

-- 합산용 새 카운터 행을 organization 단위로 upsert
-- (이미 organization_id가 채워진 행끼리도 같은 org에 속하면 합산해야 함)
-- 1) 기존 행을 org/year_month로 합산한 결과를 임시 테이블에 적재
do $$
begin
  -- 임시 테이블에 합산 결과 적재
  drop table if exists tmp_org_counters;
  create temporary table tmp_org_counters as
  select organization_id, year_month, sum(generations)::int as total_generations
  from usage_counters
  where organization_id is not null
  group by organization_id, year_month;

  -- 기존 brand 단위 행은 유지하되, organization 단위로도 한 행을 보장하기 위해
  -- 새로운 (organization_id, year_month, brand_id=NULL, generations=합산) 마스터 행을 만든다.
  -- 단 이렇게 하면 PK(brand_id, year_month) 충돌 가능 — brand_id는 NULL 허용 + PK 변경 필요.
  -- 따라서: 기존 PK를 드롭하고 (organization_id, year_month, brand_id) 복합 PK로 변경.
  null;
end$$;

-- usage_counters PK 재구성: brand_id 단독 PK 부분 → organization_id 포함
do $$
begin
  -- 기존 PK 이름 조회 후 드롭
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.usage_counters'::regclass and contype = 'p'
  ) then
    execute (
      select format('alter table usage_counters drop constraint %I', conname)
      from pg_constraint
      where conrelid = 'public.usage_counters'::regclass and contype = 'p'
      limit 1
    );
  end if;
end$$;

-- brand_id를 nullable로 (마스터 org-단위 row를 위함)
alter table usage_counters alter column brand_id drop not null;

-- 신규 PK: id 자동 생성
alter table usage_counters add column if not exists id uuid default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.usage_counters'::regclass and contype = 'p'
  ) then
    alter table usage_counters add primary key (id);
  end if;
end$$;

-- 무결성: 동일 (organization_id, year_month, brand_id) 조합은 UNIQUE
-- brand_id가 NULL이면 org-마스터 row, NOT NULL이면 brand-단위 historical row
create unique index if not exists usage_counters_org_brand_year_month_uq
  on usage_counters(organization_id, year_month, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 마스터 org-단위 row 생성 (brand_id=NULL, generations=합산)
insert into usage_counters (organization_id, brand_id, year_month, generations)
select organization_id, NULL::uuid, year_month, total_generations
from (
  select organization_id, year_month, sum(generations)::int as total_generations
  from usage_counters
  where organization_id is not null and brand_id is not null
  group by organization_id, year_month
) agg
on conflict (organization_id, year_month, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))
do update set generations = excluded.generations;

-- ────────────────────────────────────────────────────────────────────────
-- 8. portone_orders.organization_id 추가 + 데이터 이관
-- ────────────────────────────────────────────────────────────────────────
alter table portone_orders
  add column if not exists organization_id uuid references organizations(id) on delete set null;

create index if not exists portone_orders_organization_id_idx
  on portone_orders(organization_id);

update portone_orders po
set organization_id = b.organization_id
from brands b
where po.organization_id is null
  and po.brand_id = b.id
  and b.organization_id is not null;

-- ────────────────────────────────────────────────────────────────────────
-- 9. plan_rank 함수
-- ────────────────────────────────────────────────────────────────────────
-- 한 user가 여러 org를 갖고 각 org의 plan이 다를 때, "가장 높은 plan"을
-- 산정해야 하는 케이스(예: brandLimit 합산)에서 사용.
-- 순위: studio(5) > pro(4) > label(3) > starter(2) > free(1)
create or replace function plan_rank(plan_key text)
returns int
language sql
immutable
as $$
  select case plan_key
    when 'studio'  then 5
    when 'pro'     then 4
    when 'label'   then 3
    when 'starter' then 2
    when 'free'    then 1
    else 0
  end;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 10. increment_org_generation_count RPC (B4)
-- ────────────────────────────────────────────────────────────────────────
-- 호출: rpc('increment_org_generation_count', { p_org_id: <uuid>, p_year_month: 'YYYY-MM' })
-- usage_counters의 org-마스터 row(brand_id=NULL)에 atomic +1.
create or replace function increment_org_generation_count(
  p_org_id uuid,
  p_year_month text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usage_counters (organization_id, brand_id, year_month, generations)
  values (p_org_id, NULL, p_year_month, 1)
  on conflict (organization_id, year_month, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set generations = usage_counters.generations + 1;
end;
$$;

revoke all on function increment_org_generation_count(uuid, text) from public;
grant execute on function increment_org_generation_count(uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 11. 검증용 view (선택사항)
-- ────────────────────────────────────────────────────────────────────────
-- 대시보드/디버깅용으로 organization 단위 사용량을 빠르게 보기 위한 view.
create or replace view organization_usage_summary with (security_invoker = true) as
select
  o.id as organization_id,
  o.owner_id,
  o.name,
  count(distinct b.id) as brand_count,
  count(distinct om.user_id) as member_count,
  coalesce(sum(case when uc.brand_id is null and uc.year_month = to_char(now(), 'YYYY-MM') then uc.generations else 0 end), 0) as current_month_generations,
  s.plan as active_plan,
  s.plan_tier as active_plan_tier,
  s.current_period_end
from organizations o
left join brands b on b.organization_id = o.id
left join organization_members om on om.organization_id = o.id
left join usage_counters uc on uc.organization_id = o.id
left join subscriptions s on s.organization_id = o.id and s.status in ('active','trialing')
group by o.id, o.owner_id, o.name, s.plan, s.plan_tier, s.current_period_end;
