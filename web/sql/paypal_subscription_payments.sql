-- PayPal 구독 갱신 결제 이력 (PAYMENT.SALE.COMPLETED 웹훅 시 insert).
-- Supabase SQL Editor에서 실행.

create table if not exists public.paypal_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  credits integer not null,
  amount_usd numeric not null,
  paid_at timestamptz not null default now(),
  paypal_sale_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists paypal_subscription_payments_subscription_id_idx
  on public.paypal_subscription_payments (subscription_id);
create index if not exists paypal_subscription_payments_user_id_idx
  on public.paypal_subscription_payments (user_id);
create index if not exists paypal_subscription_payments_paid_at_idx
  on public.paypal_subscription_payments (paid_at desc);

comment on table public.paypal_subscription_payments is '구독 결제 이력(첫 결제 + 갱신). PAYMENT.SALE.COMPLETED 시마다 insert. paypal_sale_id로 이중 기록 방지';

-- RLS: service_role 만 read/write (publishable key 직접 접근 차단).
-- 마이그레이션: web/supabase/migrations/20260517120000_paypal_rls.sql (H-1 패치).
-- 정책이 없는 RLS 와 using (false) 정책은 service_role 입장에서 동일 동작이지만,
-- 명시적 정책이 있어야 pg_policies 운영 점검에서 "정책 없음" 으로 오해되지 않음.
alter table public.paypal_subscription_payments enable row level security;
drop policy if exists "service role only" on public.paypal_subscription_payments;
create policy "service role only" on public.paypal_subscription_payments using (false);
