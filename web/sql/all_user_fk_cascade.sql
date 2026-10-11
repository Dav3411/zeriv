-- 모든 auth.users 참조 테이블에 ON DELETE CASCADE (또는 SET NULL) 적용.
-- 계정 삭제 시 해당 UUID가 다른 테이블에 남지 않도록 함. Supabase SQL Editor에서 실행.

-- 1) 고아 행 정리 (auth.users에 없는 user_id/owner_id 등)
delete from public.credit_ledger where user_id not in (select id from auth.users);
delete from public.jobs where user_id not in (select id from auth.users);
delete from public.reward_agent_shares where agent_user_id not in (select id from auth.users);
delete from public.reward_payouts where user_id not in (select id from auth.users);
delete from public.rewards_monthly where user_id not in (select id from auth.users);
delete from public.withdrawal_requests where user_id not in (select id from auth.users);
delete from public.referrals where referrer_user_id not in (select id from auth.users) or referred_user_id not in (select id from auth.users);
update public.analytics_events set user_id = null where user_id is not null and user_id not in (select id from auth.users);
delete from public.credit_wallets where user_id not in (select id from auth.users);
delete from public.user_wallets where user_id not in (select id from auth.users);
delete from public.clips where owner_id not in (select id from auth.users);
delete from public.agents where user_id not in (select id from auth.users);

-- 2) 아래에서 추가할 테이블만 해당: auth.users 참조 기존 FK 제거 (profiles 등 기존 CASCADE FK는 유지)
do $$
declare r record;
  auth_users_oid oid := (select oid from pg_class where relname = 'users' and relnamespace = (select oid from pg_namespace where nspname = 'auth'));
  target_tables text[] := array['credit_wallets','user_wallets','clips','jobs','agents','credit_ledger','reward_payouts','withdrawal_requests','referrals','reward_agent_shares','rewards_monthly','analytics_events'];
begin
  for r in (
    select t.relname as tname, c.conname as cname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public' and t.relkind = 'r' and c.contype = 'f'
    and c.confrelid = auth_users_oid
    and t.relname = any(target_tables)
  ) loop
    execute format('alter table public.%I drop constraint if exists %I', r.tname, r.cname);
  end loop;
end $$;

-- 3) CASCADE FK 추가
alter table public.credit_wallets
  add constraint credit_wallets_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.user_wallets
  add constraint user_wallets_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.clips
  add constraint clips_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.jobs
  add constraint jobs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.agents
  add constraint agents_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.credit_ledger
  add constraint credit_ledger_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.reward_payouts
  add constraint reward_payouts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.referrals
  add constraint referrals_referrer_user_id_fkey
  foreign key (referrer_user_id) references auth.users(id) on delete cascade;

alter table public.referrals
  add constraint referrals_referred_user_id_fkey
  foreign key (referred_user_id) references auth.users(id) on delete cascade;

alter table public.reward_agent_shares
  add constraint reward_agent_shares_agent_user_id_fkey
  foreign key (agent_user_id) references auth.users(id) on delete cascade;

alter table public.rewards_monthly
  add constraint rewards_monthly_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- 4) analytics_events: user_id는 nullable → 삭제 시 NULL만 설정 (이벤트는 유지)
-- (step 2에서 이미 auth.users 참조 FK 제거됨. 없으면 add만 함.)
alter table public.analytics_events
  add constraint analytics_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
