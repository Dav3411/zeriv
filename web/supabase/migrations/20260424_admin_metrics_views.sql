-- jobs 일별 통계
create or replace view public.jobs_daily_stats with (security_invoker = true) as
select
  date(created_at) as day,
  status,
  count(*) as total
from public.jobs
group by date(created_at), status;

-- analytics events 일별 통계 (p0 대시보드 대상 이벤트만 집계)
create or replace view public.analytics_events_daily_stats with (security_invoker = true) as
select
  date(created_at) as day,
  event_name,
  count(*) as total
from public.analytics_events
where event_name in (
  'share_open',
  'share_complete',
  'remix_start',
  'paywall_shown',
  'checkout_start'
)
group by date(created_at), event_name;

-- credit ledger 일별 통계
-- credit_ledger 테이블에 created_at 컬럼이 없으므로 updated_at 사용
-- status 값: reserved | captured | refund
create or replace view public.credit_ledger_daily_stats with (security_invoker = true) as
select
  date(updated_at) as day,
  status,
  sum(amount) as total_amount,
  count(*) as total
from public.credit_ledger
group by date(updated_at), status;

grant select on public.jobs_daily_stats to service_role;
grant select on public.analytics_events_daily_stats to service_role;
grant select on public.credit_ledger_daily_stats to service_role;
