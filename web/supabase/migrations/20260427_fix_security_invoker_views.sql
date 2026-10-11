-- SECURITY DEFINER 뷰를 security_invoker = true 로 교체.
-- RLS·권한 체크가 뷰 생성자가 아닌 조회자(service_role) 기준으로 적용된다.
alter view public.jobs_daily_stats set (security_invoker = true);
alter view public.analytics_events_daily_stats set (security_invoker = true);
alter view public.credit_ledger_daily_stats set (security_invoker = true);
alter view public.organization_usage_summary set (security_invoker = true);
