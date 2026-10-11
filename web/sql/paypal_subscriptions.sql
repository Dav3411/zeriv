-- PayPal 구독(정기 결제) 추적. checkout 시 insert, 승인/웹훅 시 갱신.
-- Supabase SQL Editor에서 실행.

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

create index if not exists paypal_subscriptions_subscription_id_idx on public.paypal_subscriptions (subscription_id);
create index if not exists paypal_subscriptions_user_id_idx on public.paypal_subscriptions (user_id);

comment on table public.paypal_subscriptions is 'PayPal Subscriptions; 정기 결제 구독 추적';

-- RLS: service_role 만 read/write (publishable key 직접 접근 차단).
-- 마이그레이션: web/supabase/migrations/20260517120000_paypal_rls.sql (H-1 패치).
-- PortOne 테이블과 동일한 패턴 (using (false)).
alter table public.paypal_subscriptions enable row level security;
drop policy if exists "service role only" on public.paypal_subscriptions;
create policy "service role only" on public.paypal_subscriptions using (false);
