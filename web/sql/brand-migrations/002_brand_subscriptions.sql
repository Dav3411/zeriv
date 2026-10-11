-- 002_brand_subscriptions.sql
-- 브랜드 단위 구독 (갤럭시아머니트리 정기결제)

-- 1. subscriptions 테이블
create table if not exists subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references brands(id) on delete cascade,
  user_id               uuid not null references auth.users(id),
  plan                  text not null check (plan in ('starter','brand','studio')),
  status                text not null default 'active'
                          check (status in ('active','past_due','cancelled','trialing')),
  billing_key           text,
  billing_key_issued_at timestamptz,
  current_period_start  timestamptz not null,
  current_period_end    timestamptz not null,
  next_billing_at       timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create unique index if not exists subscriptions_brand_active
  on subscriptions(brand_id)
  where status in ('active','trialing','past_due');

-- 2. billing_events 테이블
create table if not exists billing_events (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references subscriptions(id),
  galaxia_order_id    text unique,
  galaxia_tid         text,
  galaxia_auth_code   text,
  payment_type        text not null check (payment_type in ('initial','recurring','manual')),
  amount              integer not null,
  status              text not null check (status in ('pending','success','failed','cancelled','refunded')),
  failure_reason      text,
  attempted_at        timestamptz default now(),
  confirmed_at        timestamptz
);

-- 3. usage_counters 테이블 (Starter 월 생성 한도 추적)
create table if not exists usage_counters (
  brand_id    uuid references brands(id) on delete cascade,
  year_month  text not null,
  generations integer default 0,
  primary key (brand_id, year_month)
);

-- 4. brands 테이블에 subscription_id 컬럼 추가
alter table brands add column if not exists subscription_id uuid references subscriptions(id);

-- 5. Atomic increment function (race condition 방지)
CREATE OR REPLACE FUNCTION increment_brand_generation_count(
  p_brand_id uuid,
  p_year_month text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO usage_counters (brand_id, year_month, generations)
  VALUES (p_brand_id, p_year_month, 1)
  ON CONFLICT (brand_id, year_month)
  DO UPDATE SET generations = usage_counters.generations + 1;
END;
$$;
