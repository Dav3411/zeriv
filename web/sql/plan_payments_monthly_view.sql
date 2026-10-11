-- 월별 플랜 결제량 통계 뷰 (Supabase에서 확인용)
-- paypal_orders 중 status = 'captured' 만 집계.
-- Supabase SQL Editor에서 실행 후, Table Editor 또는 SQL로 조회 가능.
--
-- M-2 패치 (2026-05-17): security_invoker = true 명시.
-- 기본 view 는 owner 권한으로 실행되어 RLS 우회 가능 (postgres 가 owner 면
-- paypal_orders RLS 무시하고 결제 PII 노출). migration_new_project.sql 통합
-- 스크립트의 동일 view 는 이미 security_invoker = true 명시. 이 standalone
-- 파일이 신규 환경 셋업에 단독 실행될 경우 일관성 유지 필요.

create or replace view public.plan_payments_monthly
  with (security_invoker = true) as
select
  to_char(date_trunc('month', coalesce(captured_at, created_at))::date, 'YYYY-MM') as month,
  plan_id,
  count(*)::int as count,
  coalesce(sum(amount_usd), 0)::numeric(12,2) as amount_usd
from public.paypal_orders
where status = 'captured'
group by date_trunc('month', coalesce(captured_at, created_at)), plan_id
order by date_trunc('month', coalesce(captured_at, created_at)) desc, plan_id;

comment on view public.plan_payments_monthly is '월·플랜별 결제 건수/금액 (paypal_orders captured only)';

-- 월별 합계만 보고 싶을 때 사용할 수 있는 뷰 (플랜 구분 없이 월 단위 합계)
create or replace view public.plan_payments_monthly_totals
  with (security_invoker = true) as
select
  to_char(date_trunc('month', coalesce(captured_at, created_at))::date, 'YYYY-MM') as month,
  count(*)::int as total_count,
  coalesce(sum(amount_usd), 0)::numeric(12,2) as total_usd
from public.paypal_orders
where status = 'captured'
group by date_trunc('month', coalesce(captured_at, created_at))
order by date_trunc('month', coalesce(captured_at, created_at)) desc;

comment on view public.plan_payments_monthly_totals is '월별 결제 합계 (건수·USD)';
