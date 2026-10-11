-- 관리자 행위 감사 로그.
-- 어드민 패널에서 수행되는 모든 권한 변경(plan_change, account_delete, credits_adjust,
-- job_cancel 등)을 best-effort로 적재한다. 실패해도 원본 액션은 막지 않는다.
create table if not exists admin_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action        text not null,
  target_type   text not null,
  target_id     text not null,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on admin_audit_logs(created_at desc);

alter table admin_audit_logs enable row level security;

drop policy if exists "service role only" on admin_audit_logs;
create policy "service role only" on admin_audit_logs using (false);
