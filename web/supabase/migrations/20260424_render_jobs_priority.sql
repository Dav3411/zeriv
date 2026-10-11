-- jobs에 priority 컬럼 추가. studio 플랜 job은 priority=10, 그 외 0.
-- 워커는 priority DESC, created_at ASC 순서로 pick.
alter table jobs
  add column if not exists priority int not null default 0;

create index if not exists jobs_priority_created_idx
  on jobs(priority desc, created_at asc)
  where status in ('pending', 'queued');
