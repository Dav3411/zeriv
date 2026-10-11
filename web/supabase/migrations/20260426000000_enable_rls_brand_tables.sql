-- ────────────────────────────────────────────────────────────────────────
-- M-1: brand_* 테이블 RLS 활성화 (보안 감사 후속 조치)
-- 2026-04-26
--
-- Background:
--   보안 감사 결과 brand_reference_images / brand_profiles / brand_concepts
--   3개 테이블에 ENABLE ROW LEVEL SECURITY가 빠진 것으로 확인됐다.
--   현 시점 코드는 모두 supabaseAdmin (service-role)로만 접근하므로 즉시
--   IDOR가 발생하지는 않지만, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY로 직접
--   PostgREST에 붙으면 모든 사용자 데이터가 노출된다 (RLS off → row 전부 허용).
--
-- Strategy:
--   기존 portone_orders / organizations / organization_members 패턴과 동일하게
--   `using (false)` 단일 permissive 정책을 적용한다.
--   - service_role: RLS 우회 → 기존 API 동작 유지
--   - authenticated/anon (publishable key): policy(false) → 모든 row 차단
--
--   PostgreSQL 정책 평가 의미:
--     RLS가 enabled인데 permissive 정책의 USING이 모두 false면 시각적으로
--     모든 row가 보이지 않게 된다. RESTRICTIVE 정책을 추가로 거는 것은
--     중복(이미 단일 permissive로 전부 차단됨)이므로 코드베이스 컨벤션에
--     맞춰 단순 permissive `using (false)` 패턴을 유지한다.
--
-- Idempotency:
--   - ENABLE ROW LEVEL SECURITY는 이미 켜져 있어도 no-op
--   - drop policy if exists로 재실행 안전
--   - to_regclass()로 테이블 존재 여부 확인 — 테이블 미생성 환경에서도
--     안전하게 건너뜀 (20260326_brand_profiles.sql이 아직 미적용일 수 있음)
-- ────────────────────────────────────────────────────────────────────────

-- brand_reference_images
do $$
begin
  if to_regclass('public.brand_reference_images') is not null then
    execute 'alter table brand_reference_images enable row level security';
    execute 'drop policy if exists "service role only" on brand_reference_images';
    execute 'create policy "service role only" on brand_reference_images using (false)';
  end if;
end $$;

-- brand_profiles
do $$
begin
  if to_regclass('public.brand_profiles') is not null then
    execute 'alter table brand_profiles enable row level security';
    execute 'drop policy if exists "service role only" on brand_profiles';
    execute 'create policy "service role only" on brand_profiles using (false)';
  end if;
end $$;

-- brand_concepts
do $$
begin
  if to_regclass('public.brand_concepts') is not null then
    execute 'alter table brand_concepts enable row level security';
    execute 'drop policy if exists "service role only" on brand_concepts';
    execute 'create policy "service role only" on brand_concepts using (false)';
  end if;
end $$;
