-- ============================================================================
-- KIRICAST: 새 Supabase 프로젝트 통합 마이그레이션
-- 생성일: 2026-03-10
-- 대상: 로그인, 결제, 페르소나, 잡 처리, 리워드/정산, 분석
-- 제외: agents, clips, clip_series, clip_likes, clip_reports, clip_views 등
-- 실행: Supabase SQL Editor에서 전체 붙여넣어 한 번에 실행
-- ============================================================================

-- ============================================================================
-- 1. 테이블 생성 (의존성 순서)
-- ============================================================================

-- ----- 1.1 profiles (유저 프로필) -----
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_nickname_idx
  on public.profiles (lower(nickname));

-- ----- 1.2 signup_otps (가입 전 이메일 OTP) -----
create table if not exists public.signup_otps (
  email text not null primary key,
  otp_hash text not null,
  nickname text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);

create index if not exists signup_otps_expires_at_idx
  on public.signup_otps (expires_at);

-- ----- 1.3 referrals (추천인) -----
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending',
  rewarded_at timestamptz null
);

create index if not exists referrals_referrer_user_id_idx
  on public.referrals (referrer_user_id);
create index if not exists referrals_referred_user_id_idx
  on public.referrals (referred_user_id);

-- ----- 1.4 credit_wallets (크레딧 지갑) -----
create table if not exists public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.credit_wallets
  drop constraint if exists credit_wallets_balance_non_negative;
alter table public.credit_wallets
  add constraint credit_wallets_balance_non_negative check (balance >= 0);

-- ----- 1.5 credit_ledger (크레딧 원장) -----
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid,          -- nullable (에이전트 건은 job_id 없음)
  agent_id uuid,        -- nullable (에이전트 생성 시에만 사용)
  amount integer not null,
  status text not null,  -- reserved | captured | refund
  updated_at timestamptz not null default now()
);

-- ----- 1.6 user_wallets (리워드 출금 지갑) -----
create table if not exists public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reward_balance_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- ----- 1.7 paypal_orders (PayPal 단건 결제) -----
create table if not exists public.paypal_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  credits integer not null,
  amount_usd numeric not null,
  status text not null default 'pending',  -- pending | captured | failed
  created_at timestamptz not null default now(),
  captured_at timestamptz
);

create index if not exists paypal_orders_order_id_idx
  on public.paypal_orders (order_id);
create index if not exists paypal_orders_user_id_idx
  on public.paypal_orders (user_id);

-- ----- 1.8 paypal_subscriptions (PayPal 정기결제) -----
create table if not exists public.paypal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  credits integer not null,
  amount_usd numeric not null,
  status text not null default 'pending',  -- pending | active | cancelled | suspended | expired
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists paypal_subscriptions_subscription_id_idx
  on public.paypal_subscriptions (subscription_id);
create index if not exists paypal_subscriptions_user_id_idx
  on public.paypal_subscriptions (user_id);

-- ----- 1.9 paypal_subscription_payments (정기결제 이력) -----
create table if not exists public.paypal_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  credits integer not null,
  amount_usd numeric not null,
  paid_at timestamptz not null default now(),
  paypal_sale_id text unique,
  is_first_payment boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists paypal_subscription_payments_subscription_id_idx
  on public.paypal_subscription_payments (subscription_id);
create index if not exists paypal_subscription_payments_user_id_idx
  on public.paypal_subscription_payments (user_id);
create index if not exists paypal_subscription_payments_paid_at_idx
  on public.paypal_subscription_payments (paid_at desc);
create unique index if not exists paypal_subscription_payments_first_per_sub_idx
  on public.paypal_subscription_payments (subscription_id)
  where (is_first_payment = true);

-- ----- 1.10 user_subscriptions (유저 현재 구독) -----
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null,
  period_ends_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_period_ends_at_idx
  on public.user_subscriptions (period_ends_at);

-- ----- 1.11 personas (AI 인플루언서 페르소나) -----
create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  preset_type text not null default 'custom'
    check (preset_type in ('k_beauty', '2_5d_ani', 'custom')),
  selections jsonb default '{}'::jsonb,
  face_image_key text,
  base_model text,
  lora_config jsonb default '[]'::jsonb,
  generation_prompt text,
  generation_seed bigint,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personas_user_id
  on public.personas (user_id);
create index if not exists idx_personas_updated_at
  on public.personas (updated_at desc);

-- ----- 1.12 user_persona (유저당 1개 인플루언서 참조) -----
create table if not exists public.user_persona (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reference_image_url text,
  reference_fullbody_image_url text,
  base_model text,
  lora_config jsonb default '[]'::jsonb,
  generation_prompt text,
  generation_seed bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- 1.13 jobs (메인 잡 큐) -----
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued',  -- queued | processing | completed | failed
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  progress integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  idempotency_key text,
  credit_ledger_id uuid,
  credit_cost integer,
  source text default 'production',
  requeued_at timestamptz
);

create index if not exists idx_jobs_user_id on public.jobs (user_id);
create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_jobs_created_at on public.jobs (created_at desc);
create index if not exists idx_jobs_source_status on public.jobs (source, status);

-- ----- 1.14 render_jobs (이미지 렌더링 잡) -----
create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  situation_prompt text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  output_image_key text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_render_jobs_user_id on public.render_jobs (user_id);
create index if not exists idx_render_jobs_persona_id on public.render_jobs (persona_id);
create index if not exists idx_render_jobs_status on public.render_jobs (status);
create index if not exists idx_render_jobs_created_at on public.render_jobs (created_at desc);

-- ----- 1.15 script_generation_jobs (스크립트 생성 잡) -----
create table if not exists public.script_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed')),
  progress int default 0,
  payload jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  source text default 'production'
);

create index if not exists idx_script_generation_jobs_user_created
  on public.script_generation_jobs (user_id, created_at desc);
create index if not exists idx_script_generation_jobs_status_started
  on public.script_generation_jobs (status, started_at)
  where status in ('queued', 'processing');
create index if not exists idx_script_jobs_source_status
  on public.script_generation_jobs (source, status);

-- ----- 1.16 rewards_monthly (월별 리워드) -----
-- clip_id FK 제거 (clips 테이블 미포함). uuid 컬럼만 유지.
create table if not exists public.rewards_monthly (
  month text not null,
  clip_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  valid_views integer not null default 0,
  weight numeric,
  reward_usd numeric not null default 0,
  rank integer,
  status text default 'pending',  -- pending | applied
  primary key (month, clip_id)
);

-- ----- 1.17 reward_payouts (월별 유저 리워드 합계) -----
create table if not exists public.reward_payouts (
  month text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric not null default 0,
  applied_at timestamptz,
  primary key (month, user_id)
);

-- ----- 1.18 reward_agent_shares (에이전트 리워드 재분배) -----
-- clips/agents FK 제거. uuid 컬럼만 유지.
create table if not exists public.reward_agent_shares (
  month text not null,
  clip_id uuid not null,
  agent_id uuid not null,
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  share_usd numeric not null check (share_usd >= 0),
  payout_skipped_reason text,
  created_at timestamptz not null default now(),
  primary key (month, clip_id, agent_id)
);

create index if not exists reward_agent_shares_month_agent_user_idx
  on public.reward_agent_shares (month, agent_user_id);

-- ----- 1.19 settlement_runs (정산 실행 기록) -----
create table if not exists public.settlement_runs (
  month text primary key,
  fund_usd numeric,
  top_count integer,
  total_clips integer,
  alpha numeric
);

-- ----- 1.20 monthly_revenue (월별 매출) -----
create table if not exists public.monthly_revenue (
  month text primary key,
  credit_revenue_usd numeric not null default 0,
  ad_revenue_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- ----- 1.21 payout_destinations (출금 수령처) -----
create table if not exists public.payout_destinations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  method text not null default 'paypal',
  paypal_email text,
  updated_at timestamptz not null default now()
);

create index if not exists payout_destinations_method_idx
  on public.payout_destinations (method);

-- ----- 1.22 withdrawal_requests (출금 요청) -----
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric not null check (amount_usd > 0),
  status text not null default 'pending',  -- pending | completed | rejected
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  note text
);

create index if not exists withdrawal_requests_user_id_idx
  on public.withdrawal_requests (user_id);
create index if not exists withdrawal_requests_status_idx
  on public.withdrawal_requests (status);

-- ----- 1.23 analytics_events (분석 이벤트) -----
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  anon_id text not null,
  event_name text not null,
  url text,
  properties jsonb,
  user_agent text
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name);
create index if not exists analytics_events_user_id_idx
  on public.analytics_events (user_id);
create index if not exists analytics_events_anon_id_idx
  on public.analytics_events (anon_id);


-- ============================================================================
-- 2. RLS (Row Level Security) 활성화 및 정책
-- ============================================================================

-- profiles
alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- signup_otps (service role only)
alter table public.signup_otps enable row level security;

-- paypal_subscription_payments (service role only)
alter table public.paypal_subscription_payments enable row level security;

-- personas
alter table public.personas enable row level security;

drop policy if exists "Users can manage own personas" on public.personas;
create policy "Users can manage own personas"
  on public.personas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_persona
alter table public.user_persona enable row level security;

drop policy if exists "Users can read own user_persona" on public.user_persona;
create policy "Users can read own user_persona"
  on public.user_persona for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own user_persona" on public.user_persona;
create policy "Users can update own user_persona"
  on public.user_persona for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can insert own user_persona" on public.user_persona;
create policy "Users can insert own user_persona"
  on public.user_persona for insert
  with check (auth.uid() = user_id);

-- jobs
alter table public.jobs enable row level security;

drop policy if exists "Users can manage own jobs" on public.jobs;
create policy "Users can manage own jobs"
  on public.jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- render_jobs
alter table public.render_jobs enable row level security;

drop policy if exists "Users can manage own render jobs" on public.render_jobs;
create policy "Users can manage own render jobs"
  on public.render_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- script_generation_jobs
alter table public.script_generation_jobs enable row level security;

drop policy if exists "Users can view own script_generation_jobs" on public.script_generation_jobs;
create policy "Users can view own script_generation_jobs"
  on public.script_generation_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own script_generation_jobs" on public.script_generation_jobs;
create policy "Users can insert own script_generation_jobs"
  on public.script_generation_jobs for insert
  with check (auth.uid() = user_id);

-- service_role only 테이블들 (정책 없음 = anon/authenticated 접근 불가)
-- paypal_subscription_payments 는 L392 에서 먼저 활성화되었으나, 가독성 일관성을
-- 위해 이 블록에도 명시 (alter ... enable rls 는 재실행 no-op 이라 안전).
alter table public.referrals enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.user_wallets enable row level security;
alter table public.paypal_orders enable row level security;
alter table public.paypal_subscriptions enable row level security;
alter table public.paypal_subscription_payments enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.rewards_monthly enable row level security;
alter table public.reward_payouts enable row level security;
alter table public.reward_agent_shares enable row level security;
alter table public.settlement_runs enable row level security;
alter table public.monthly_revenue enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.analytics_events enable row level security;

-- PayPal 결제 PII 보호: 명시적 deny-all 정책 (H-1 패치, 2026-05-17).
-- 위 enable rls 만으로도 service_role 외 접근은 차단되지만, PortOne 컨벤션과
-- 일관되게 명시적 using (false) 정책을 추가해 pg_policies 운영 점검에서
-- "정책 없음" 으로 오해되지 않도록 한다.
drop policy if exists "service role only" on public.paypal_orders;
create policy "service role only" on public.paypal_orders using (false);
drop policy if exists "service role only" on public.paypal_subscriptions;
create policy "service role only" on public.paypal_subscriptions using (false);
drop policy if exists "service role only" on public.paypal_subscription_payments;
create policy "service role only" on public.paypal_subscription_payments using (false);

-- payout_destinations
alter table public.payout_destinations enable row level security;

drop policy if exists "Users can read own payout destination" on public.payout_destinations;
create policy "Users can read own payout destination"
  on public.payout_destinations for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own payout destination" on public.payout_destinations;
create policy "Users can insert own payout destination"
  on public.payout_destinations for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own payout destination" on public.payout_destinations;
create policy "Users can update own payout destination"
  on public.payout_destinations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================================
-- 3. RPC 함수 (Stored Procedures)
-- ============================================================================

-- 3.1 reserve_job_credits: 클립 생성 시 크레딧 예약 (FOR UPDATE 원자적 잠금)
create or replace function public.reserve_job_credits(
  p_user_id uuid, p_job_id uuid, p_amount integer
)
returns uuid language plpgsql
set search_path = public as $$
declare
  ledger_id uuid;
  current_balance integer;
begin
  insert into public.credit_wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into current_balance
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  if not found or current_balance is null then
    current_balance := 0;
  end if;
  if current_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.credit_wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = p_user_id;

  ledger_id := gen_random_uuid();
  insert into public.credit_ledger (id, user_id, job_id, amount, status, updated_at)
  values (ledger_id, p_user_id, p_job_id, p_amount, 'reserved', now());

  return ledger_id;
end;
$$;

-- CR-1 후속 패치 (2026-05-17): reserve_job_credits PUBLIC EXECUTE 회수.
-- INVOKER + write 함수. RLS 가 모든 경로를 막아준다는 보장이 없으므로
-- defense-in-depth 로 PUBLIC/anon/authenticated 차단. 호출처는 service_role
-- (web/src/app/api/personas/create-job/route.ts) 1곳만 존재.
revoke execute on function public.reserve_job_credits(uuid, uuid, integer) from public;
revoke execute on function public.reserve_job_credits(uuid, uuid, integer) from authenticated;
revoke execute on function public.reserve_job_credits(uuid, uuid, integer) from anon;

-- 3.2 release_job_credits: 예약된 크레딧 해제 (잡 실패 시)
create or replace function public.release_job_credits(p_ledger_id uuid)
returns void language plpgsql
set search_path = public as $$
declare
  v_user_id uuid;
  v_amount integer;
begin
  select user_id, amount into v_user_id, v_amount
  from public.credit_ledger
  where id = p_ledger_id and status = 'reserved';

  if not found then return; end if;

  update public.credit_wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id;

  update public.credit_ledger
  set status = 'refund', updated_at = now()
  where id = p_ledger_id;
end;
$$;

-- CR-1 후속 패치 (2026-05-17): release_job_credits PUBLIC EXECUTE 회수.
-- 호출처 2곳 모두 service_role (personas/create-job rollback, worker.mjs markJobFailed).
revoke execute on function public.release_job_credits(uuid) from public;
revoke execute on function public.release_job_credits(uuid) from authenticated;
revoke execute on function public.release_job_credits(uuid) from anon;

-- 3.3 deduct_agent_credits: 에이전트 생성 시 즉시 차감
create or replace function public.deduct_agent_credits(
  p_user_id uuid, p_agent_id uuid, p_amount integer
)
returns uuid language plpgsql
set search_path = public as $$
declare
  ledger_id uuid;
  current_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  insert into public.credit_wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into current_balance
  from public.credit_wallets where user_id = p_user_id;
  if current_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.credit_wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = p_user_id;

  ledger_id := gen_random_uuid();
  insert into public.credit_ledger (id, user_id, job_id, agent_id, amount, status, updated_at)
  values (ledger_id, p_user_id, null, p_agent_id, p_amount, 'captured', now());

  return ledger_id;
end;
$$;

-- CR-1 후속 패치 (2026-05-17): deduct_agent_credits PUBLIC EXECUTE 회수.
-- 현재 코드 호출처 0건(dead) 이지만 정의가 남아있는 동안은 anon 노출 위험 동일.
revoke execute on function public.deduct_agent_credits(uuid, uuid, integer) from public;
revoke execute on function public.deduct_agent_credits(uuid, uuid, integer) from authenticated;
revoke execute on function public.deduct_agent_credits(uuid, uuid, integer) from anon;

-- 3.4 refund_agent_credits: 에이전트 생성 실패 시 환불
create or replace function public.refund_agent_credits(
  p_user_id uuid, p_agent_id uuid, p_amount integer
)
returns void language plpgsql
set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  update public.credit_wallets
  set balance = balance + p_amount, updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_ledger (id, user_id, job_id, agent_id, amount, status, updated_at)
  values (gen_random_uuid(), p_user_id, null, p_agent_id, -p_amount, 'refund', now());
end;
$$;

-- CR-1 후속 패치 (2026-05-17): refund_agent_credits PUBLIC EXECUTE 회수.
-- 현재 dead code 지만 정의가 살아있는 한 anon 호출 가능.
revoke execute on function public.refund_agent_credits(uuid, uuid, integer) from public;
revoke execute on function public.refund_agent_credits(uuid, uuid, integer) from authenticated;
revoke execute on function public.refund_agent_credits(uuid, uuid, integer) from anon;

-- 3.5 increment_credit_balance: 크레딧 잔액 원자적 증가
create or replace function public.increment_credit_balance(
  p_user_id uuid, p_amount integer
)
returns void language plpgsql
set search_path = public as $$
begin
  insert into public.credit_wallets (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set balance = credit_wallets.balance + p_amount, updated_at = now();
end;
$$;

-- CR-1 후속 패치 (2026-05-17): increment_credit_balance PUBLIC EXECUTE 회수.
-- 현재 dead code. 정의가 남아있는 한 anon key 만으로 임의 user 크레딧 가산 가능.
revoke execute on function public.increment_credit_balance(uuid, integer) from public;
revoke execute on function public.increment_credit_balance(uuid, integer) from authenticated;
revoke execute on function public.increment_credit_balance(uuid, integer) from anon;

-- 3.6 deduct_reward_balance: 리워드 출금 시 잔액 차감
create or replace function public.deduct_reward_balance(
  p_user_id uuid, p_amount numeric
)
returns numeric language plpgsql
set search_path = public as $$
declare
  current_bal numeric;
begin
  select reward_balance_usd into current_bal
  from public.user_wallets
  where user_id = p_user_id
  for update;

  if not found or current_bal is null then
    current_bal := 0;
  end if;
  if current_bal < p_amount then
    raise exception 'INSUFFICIENT_REWARD_BALANCE';
  end if;

  update public.user_wallets
  set reward_balance_usd = reward_balance_usd - p_amount, updated_at = now()
  where user_id = p_user_id;

  return current_bal - p_amount;
end;
$$;

-- CR-1 후속 패치 (2026-05-17): deduct_reward_balance PUBLIC EXECUTE 회수.
-- 현재 dead code. INVOKER + numeric 인자라 RLS 우회는 어렵지만 명시적 차단.
revoke execute on function public.deduct_reward_balance(uuid, numeric) from public;
revoke execute on function public.deduct_reward_balance(uuid, numeric) from authenticated;
revoke execute on function public.deduct_reward_balance(uuid, numeric) from anon;

-- 3.7 record_subscription_first_payment: 구독 첫 결제 1회만 기록 + 크레딧 지급
create or replace function public.record_subscription_first_payment(
  p_subscription_id text,
  p_user_id uuid,
  p_plan_id text,
  p_credits integer,
  p_amount_usd numeric,
  p_paid_at timestamptz,
  p_paypal_sale_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.paypal_subscription_payments (
    subscription_id, user_id, plan_id, credits, amount_usd, paid_at, paypal_sale_id, is_first_payment
  )
  values (
    p_subscription_id, p_user_id, p_plan_id, p_credits, p_amount_usd, p_paid_at, p_paypal_sale_id, true
  )
  on conflict (subscription_id) where (is_first_payment = true) do nothing
  returning id into v_id;

  if v_id is null then
    return 'already_recorded';
  end if;

  insert into public.credit_wallets (user_id, balance, updated_at)
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  update public.credit_wallets
  set balance = balance + p_credits, updated_at = now()
  where user_id = p_user_id;

  return 'credited';
end;
$$;

-- CR-1 패치 (2026-05-17): record_subscription_first_payment PUBLIC EXECUTE 회수.
-- security definer + 인자 검증 없음 + write(크레딧 발급) 함수이므로 PUBLIC 노출 시
-- anon key 만으로 임의 user 에게 무제한 크레딧 발급 가능. service_role 은 BYPASSRLS +
-- 함수 owner 권한이라 영향 없음 (호출처 모두 supabaseAdmin 사용).
revoke execute on function public.record_subscription_first_payment(
  text, uuid, text, integer, numeric, timestamptz, text
) from public;
revoke execute on function public.record_subscription_first_payment(
  text, uuid, text, integer, numeric, timestamptz, text
) from authenticated;
revoke execute on function public.record_subscription_first_payment(
  text, uuid, text, integer, numeric, timestamptz, text
) from anon;

-- 3.8 handle_new_user: 가입 시 profiles + credit_wallets 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  nick text;
begin
  nick := trim(coalesce(new.raw_user_meta_data->>'nickname', ''));
  if nick = '' or length(nick) < 1 or length(nick) > 32 then
    nick := 'User-' || left(new.id::text, 8);
  end if;
  insert into public.profiles (user_id, nickname, updated_at)
  values (new.id, nick, now())
  on conflict (user_id) do update set
    nickname = coalesce(excluded.nickname, profiles.nickname),
    updated_at = now();

  insert into public.credit_wallets (user_id, balance, updated_at)
  values (new.id, 0, now())
  on conflict (user_id) do nothing;

  return new;
end;
$$;


-- ============================================================================
-- 4. 트리거
-- ============================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================================
-- 5. 뷰
-- ============================================================================

-- 월별 플랜 결제량 통계 (security_invoker = true: 조회자 권한으로 실행)
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


-- ============================================================================
-- 6. 테이블 코멘트
-- ============================================================================

comment on table public.profiles is '유저 프로필 (닉네임). 가입 시 트리거로 자동 생성';
comment on table public.signup_otps is '가입 전 이메일 인증용 OTP. service_role만 접근 가능';
comment on table public.referrals is '추천인 추적. pending → rewarded';
comment on table public.credit_wallets is '유저별 크레딧 잔액. 가입 시 자동 생성, FOR UPDATE 잠금으로 동시성 제어';
comment on constraint credit_wallets_balance_non_negative on public.credit_wallets is 'Prevent negative credit balance';
comment on table public.credit_ledger is '크레딧 변동 원장. reserved → captured/refund';
comment on table public.user_wallets is '리워드 출금 가능 잔액 (USD)';
comment on table public.paypal_orders is 'PayPal Checkout 단건 주문. capture 후 크레딧 지급';
comment on table public.paypal_subscriptions is 'PayPal 정기 결제 구독 추적';
comment on table public.paypal_subscription_payments is '구독 결제 이력. PAYMENT.SALE.COMPLETED 시마다 insert. paypal_sale_id로 이중 기록 방지';
comment on column public.paypal_subscription_payments.is_first_payment is '구독 첫 결제 여부. 구독당 1건만 true 허용(partial unique)';
comment on table public.user_subscriptions is 'Current plan per user; period_ends_at = end of paid period';
comment on table public.personas is 'AI influencer persona. face_image_key = R2 key for chosen candidate. base_model + lora_config for rendering consistency';
comment on table public.user_persona is 'One influencer reference per user. reference_image_url = upper-body shot';
comment on table public.jobs is '메인 잡 큐. queued → processing → completed/failed';
comment on column public.jobs.requeued_at is 'Set when the job was requeued from processing (e.g. after worker restart)';
comment on table public.render_jobs is 'MVP: Single image render per job. output_image_key = R2 key for result';
comment on table public.script_generation_jobs is 'Script generation requests; processed by Worker calling Generator';
comment on table public.rewards_monthly is '월별 클립 리워드 정산 결과. clip_id는 FK 없이 uuid로 저장';
comment on table public.reward_payouts is '월별 유저별 리워드 합계. applied_at으로 이중 지급 방지';
comment on table public.reward_agent_shares is '월별 정산 시 클립 리워드의 15%를 타인 소유 에이전트 제작자에게 지급하는 내역';
comment on column public.reward_agent_shares.payout_skipped_reason is 'admin: 에이전트 소유자가 admin인 경우 지급 스킵';
comment on table public.settlement_runs is '월별 정산 실행 기록. 재정산 시 삭제 후 재생성';
comment on table public.monthly_revenue is '월별 매출 (크레딧 판매 + 광고). settle_rewards에서 참조';
comment on table public.payout_destinations is '리워드 출금 수령처. paypal_email 있으면 PayPal Payouts로 자동 송금';
comment on table public.withdrawal_requests is '유저 리워드 현금 출금 요청. pending → completed 시 실제 송금 처리';
comment on table public.analytics_events is 'Lightweight product metrics';
comment on view public.plan_payments_monthly is '월/플랜별 결제 건수/금액 (paypal_orders captured only)';
comment on view public.plan_payments_monthly_totals is '월별 결제 합계 (건수/USD)';
comment on function public.record_subscription_first_payment is '구독 첫 결제 1회만 기록하고 크레딧 지급. 이미 기록된 구독이면 스킵';


-- ============================================================================
-- 완료! 23개 테이블, 8개 함수, 1개 트리거, 2개 뷰 생성됨.
-- ============================================================================
