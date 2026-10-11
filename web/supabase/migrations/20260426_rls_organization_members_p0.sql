-- ────────────────────────────────────────────────────────────────────────
-- P0: organizations 멀티테넌트 RLS 정비 (brands + styles)
-- 2026-04-26
--
-- Background:
--   organizations / organization_members 도입(20260426_organizations.sql) 이후에도
--   기존 핵심 테이블 RLS는 여전히 brand owner(brands.user_id = auth.uid())만
--   허용하도록 작성되어 있다. 그 결과 organization 멤버가 publishable key로
--   PostgREST를 직접 호출하면 빈 결과를 받는다.
--
--   추가로, brands 테이블 자체에는 어떤 마이그레이션에도 ENABLE ROW LEVEL SECURITY
--   또는 정책 정의가 없는 것으로 확인됐다 (`grep`으로 전체 SQL 검사).
--   현재 코드는 supabaseAdmin(service-role)로만 접근하지만, publishable key가
--   유출되거나 클라이언트에서 직접 .from('brands') 호출이 들어오는 순간
--   모든 brand row가 IDOR로 노출된다. P0 보안 결함.
--
-- Scope (P0 only):
--   1) brands 테이블 RLS 활성화 + SELECT/INSERT/UPDATE/DELETE 4개 정책 정의
--   2) styles 테이블 4개 정책 organization 멤버 통합 (DROP + CREATE)
--   3) helper SQL 함수 3개 (access/write/admin) 추가 — SECURITY DEFINER
--
--   Out of scope (P1/P2 — 별도 마이그레이션):
--     brand_profiles / brand_concepts / brand_reference_images,
--     creative_feature_vectors / asset_performance / selection_log,
--     creative_signals, organization_members 자기 멤버십 SELECT,
--     models / assets / renders / products
--
-- Helper 함수 설계 메모:
--   - LANGUAGE sql + STABLE → 동일 트랜잭션 내 옵티마이저 캐싱 가능,
--     row-level 평가 비용 최소화.
--   - SECURITY DEFINER → 함수 정의자(supabase의 postgres superuser) 권한으로
--     실행되므로 brands / organization_members의 RLS를 우회한다.
--     이 우회가 없으면:
--       - brands 정책이 user_can_access_brand(id)를 호출 → 함수 내부에서
--         다시 brands를 SELECT → 다시 정책 평가 → 무한 재귀
--       - organization_members는 `using (false)` 라서 SECURITY INVOKER로는
--         조회 자체가 차단됨 → 모든 멤버가 권한 없음으로 평가됨
--   - SET search_path = public → search_path 변조 기반 권한 상승 차단
--     (security definer 함수에서 필수 패턴)
--   - 인자는 oid 캐스팅 가능한 uuid로 한정, 함수 본문에서 추가 검증 없이
--     auth.uid()와 입력된 brand_id의 매핑만 평가하므로 SQLi 표면 없음.
--
-- Idempotency:
--   - CREATE OR REPLACE FUNCTION
--   - DROP POLICY IF EXISTS ... 후 CREATE POLICY
--   - alter table ... enable row level security 는 이미 켜져 있어도 no-op
-- ────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────
-- 전제 조건:
--   이 마이그레이션은 20260426_organizations.sql 이후 실행을 전제하며,
--   모든 brand에 organization_id가 채워져 있음을 가정한다.
--   (brand.organization_id IS NULL 인 row가 존재하면 INSERT/UPDATE 정책에서 거부됨)
-- ────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────
-- 1. Helper 함수: brand 접근 권한 체크
-- ────────────────────────────────────────────────────────────────────────

-- 1-1) 읽기 권한: brand owner(legacy) 또는 organization 멤버 누구나
create or replace function public.user_can_access_brand(p_brand_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from brands b
    where b.id = p_brand_id
      and (
        b.user_id = auth.uid()
        or exists (
          select 1
          from organization_members om
          where om.organization_id = b.organization_id
            and om.user_id = auth.uid()
        )
      )
  );
$$;

-- 1-2) 쓰기(일반) 권한: brand owner 또는 organization owner/admin/member 모두
--      현재 organization_members.role check 제약이 ('owner','admin','member')이므로
--      role IN (...) 명시는 사실상 IS NOT NULL과 동일하지만,
--      향후 'viewer' 같은 read-only role이 추가될 가능성에 대비해 명시.
create or replace function public.user_can_write_brand(p_brand_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from brands b
    where b.id = p_brand_id
      and (
        b.user_id = auth.uid()
        or exists (
          select 1
          from organization_members om
          where om.organization_id = b.organization_id
            and om.user_id = auth.uid()
            and om.role in ('owner','admin','member')
        )
      )
  );
$$;

-- 1-3) admin 권한: brand owner 또는 organization owner/admin (member 제외)
--      DELETE 및 위험 변경에 사용.
create or replace function public.user_can_admin_brand(p_brand_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from brands b
    where b.id = p_brand_id
      and (
        b.user_id = auth.uid()
        or exists (
          select 1
          from organization_members om
          where om.organization_id = b.organization_id
            and om.user_id = auth.uid()
            and om.role in ('owner','admin')
        )
      )
  );
$$;

-- 권한 부여: authenticated가 정책 평가 중 호출 가능해야 함.
-- service_role은 어차피 RLS 우회. anon은 EXECUTE 권한 없이도 RLS가 적용되므로 불필요.
-- (anon이 인증 없이 이 함수를 직접 호출할 수 있는 표면을 닫는다)
revoke all on function public.user_can_access_brand(uuid) from public;
revoke all on function public.user_can_write_brand(uuid)  from public;
revoke all on function public.user_can_admin_brand(uuid)  from public;

grant execute on function public.user_can_access_brand(uuid) to authenticated, service_role;
grant execute on function public.user_can_write_brand(uuid)  to authenticated, service_role;
grant execute on function public.user_can_admin_brand(uuid)  to authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────
-- 2. brands 테이블 RLS 활성화 + 정책 4개
-- ────────────────────────────────────────────────────────────────────────
-- brands 테이블 자체는 그동안 RLS가 켜져 있지 않았기 때문에 publishable key로
-- 접근 시 모든 brand row가 노출되었다. P0 보안 결함을 닫는다.
--
-- 정책 매트릭스:
--   SELECT: brand owner OR organization 멤버(role 무관)
--   INSERT: 본인 owner brand 생성, 또는 organization owner/admin이 그 organization
--           id로 brand 생성 (member는 brand 신규 생성 불가)
--   UPDATE: brand owner OR organization owner/admin (member는 read-only)
--   DELETE: brand owner OR organization owner (admin·member 제외; 실수 방지)
--
-- INSERT 정책의 row-level WITH CHECK은 NEW row를 평가 대상으로 하므로
-- helper 함수 user_can_*_brand(NEW.id)는 사용 불가 (row가 아직 존재하지 않음).
-- 대신 NEW.user_id, NEW.organization_id를 직접 검증한다.

alter table brands enable row level security;

-- 기존 정책이 있을 수 있으므로 안전 드롭 (이름 충돌 방지)
drop policy if exists "brands_select_member"   on brands;
drop policy if exists "brands_insert_owner"    on brands;
drop policy if exists "brands_update_admin"    on brands;
drop policy if exists "brands_delete_owner"    on brands;

-- SELECT: 본인 brand 또는 동일 organization 멤버
-- 주의: brands SELECT 정책은 helper 함수(user_can_*_brand) 사용 불가.
--       helper 함수 내부에서 brands를 SELECT → 다시 이 정책 평가 → 무한 재귀 발생.
--       따라서 brands.user_id 및 organization_members 직접 조회로 평가한다.
create policy "brands_select_member" on brands
  for select
  using (
    user_id = auth.uid()
    or (
      organization_id is not null
      and exists (
        select 1 from organization_members om
        where om.organization_id = brands.organization_id
          and om.user_id = auth.uid()
      )
    )
  );

-- INSERT: 본인 명의(user_id=auth.uid())이고 유효한 organization의 owner/admin만 허용.
-- organization_id IS NULL 분기 제거: 20260426_organizations.sql이 모든 기존 brand에
-- organization_id를 채웠으므로 신규 INSERT에서 NULL을 허용하면 quota/결제 우회 가능.
create policy "brands_insert_owner" on brands
  for insert
  with check (
    user_id = auth.uid()
    and organization_id is not null
    and exists (
      select 1 from organization_members om
      where om.organization_id = brands.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner','admin')
    )
  );

-- UPDATE: brand owner 또는 organization owner/admin (member 제외 → read-only)
-- USING: 기존(OLD) row 기준으로 수정 권한 확인 — helper 함수 사용 가능.
-- WITH CHECK: NEW row 기준 추가 검증.
--   - organization_id IS NOT NULL: phantom org 이동 차단
--   - EXISTS: admin이 brand를 자신이 속하지 않은 organization으로 옮기는 시도 차단
--     (helper 함수는 OLD row 기준이므로 NEW.organization_id를 직접 재검증)
create policy "brands_update_admin" on brands
  for update
  using ( public.user_can_admin_brand(id) )
  with check (
    public.user_can_admin_brand(id)
    and organization_id is not null
    and exists (
      select 1 from organization_members om
      where om.organization_id = brands.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner','admin')
    )
  );

-- DELETE: brand owner 또는 organization owner only (admin도 제외)
-- 보수적 정책: brand 삭제는 cascade 영향이 매우 크므로 owner 권한만 허용.
create policy "brands_delete_owner" on brands
  for delete
  using (
    user_id = auth.uid()
    or (
      organization_id is not null
      and exists (
        select 1 from organization_members om
        where om.organization_id = brands.organization_id
          and om.user_id = auth.uid()
          and om.role = 'owner'
      )
    )
  );


-- ────────────────────────────────────────────────────────────────────────
-- 3. styles 테이블 정책 organization 멤버 통합
-- ────────────────────────────────────────────────────────────────────────
-- 기존(20260410_style_system_rewrite.sql) 4개 정책은 brand owner 만 허용.
-- DROP 후 helper 함수 기반으로 재정의.
--
-- 매트릭스:
--   SELECT: 모든 organization 멤버(role 무관)
--   INSERT: organization 멤버(member 포함) — 스타일 생성은 일반 작업
--   UPDATE: organization 멤버(member 포함)
--   DELETE: organization owner/admin 만 (member 제외)
--
-- INSERT 정책 WITH CHECK은 NEW.brand_id 기반이므로 user_can_write_brand(NEW.brand_id)
-- 사용 가능. styles row의 brand_id는 다른 brand로 옮겨질 수 있으므로
-- UPDATE는 USING(현재 brand)와 WITH CHECK(변경 후 brand) 모두 검증.

drop policy if exists "Users can view styles of own brands"   on styles;
drop policy if exists "Users can insert styles for own brands" on styles;
drop policy if exists "Users can update styles of own brands"  on styles;
drop policy if exists "Users can delete styles of own brands"  on styles;

-- 기존 새 이름 충돌 방어
drop policy if exists "styles_select_member" on styles;
drop policy if exists "styles_insert_member" on styles;
drop policy if exists "styles_update_member" on styles;
drop policy if exists "styles_delete_admin"  on styles;

create policy "styles_select_member" on styles
  for select
  using ( public.user_can_access_brand(brand_id) );

create policy "styles_insert_member" on styles
  for insert
  -- user_id = auth.uid(): 동료 사칭(다른 사용자 명의로 INSERT) 차단
  with check ( public.user_can_write_brand(brand_id) and user_id = auth.uid() );

create policy "styles_update_member" on styles
  for update
  using      ( public.user_can_write_brand(brand_id) )
  -- WITH CHECK: NEW row의 user_id가 자신이어야 함 — 명의 변조 차단
  with check ( public.user_can_write_brand(brand_id) and user_id = auth.uid() );

create policy "styles_delete_admin" on styles
  for delete
  using ( public.user_can_admin_brand(brand_id) );


-- ────────────────────────────────────────────────────────────────────────
-- 4. 검증용 쿼리 (수동 실행 — 마이그레이션 자체에서는 실행되지 않음)
-- ────────────────────────────────────────────────────────────────────────
-- brands 정책 4개 확인:
--   select polname, polcmd from pg_policy where polrelid = 'public.brands'::regclass
--   order by polcmd, polname;
--
-- styles 정책 4개 확인:
--   select polname, polcmd from pg_policy where polrelid = 'public.styles'::regclass
--   order by polcmd, polname;
--
-- RLS 활성화 확인:
--   select relname, relrowsecurity, relforcerowsecurity
--   from pg_class
--   where relname in ('brands','styles');
--
-- helper 함수 SECURITY DEFINER 확인:
--   select proname, prosecdef, provolatile, proconfig
--   from pg_proc
--   where proname in ('user_can_access_brand','user_can_write_brand','user_can_admin_brand');
--   -- prosecdef = true, provolatile = 's' (stable), proconfig = {search_path=public}
