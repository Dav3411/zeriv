-- portone_billing_keys 테이블
create table if not exists portone_billing_keys (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  plan_key        text not null,
  billing_key     text not null unique,
  pg_provider     text,
  card_last4      text,
  card_brand      text,
  status          text not null default 'active',  -- active|cancelled|expired
  fail_count      int not null default 0,
  first_paid_at   timestamptz,
  next_billing_at timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists portone_billing_keys_brand_id on portone_billing_keys(brand_id);
create index if not exists portone_billing_keys_next_billing on portone_billing_keys(next_billing_at) where status = 'active';

alter table portone_billing_keys enable row level security;
drop policy if exists "service role only" on portone_billing_keys;
create policy "service role only" on portone_billing_keys using (false);

-- subscriptions 테이블 (브랜드별 구독 상태 관리)
create table if not exists subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null unique references brands(id) on delete cascade,
  plan                text not null,
  status              text not null default 'active',  -- active|trialing|cancelled
  current_period_end  timestamptz,
  billing_key_id      uuid references portone_billing_keys(id) on delete set null,
  auto_renew          boolean not null default false,
  last_renewed_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists subscriptions_brand_id on subscriptions(brand_id);
create index if not exists subscriptions_status on subscriptions(status) where status = 'active';

alter table subscriptions enable row level security;
drop policy if exists "service role only" on subscriptions;
create policy "service role only" on subscriptions using (false);

-- 이미 subscriptions가 있는 경우: 컬럼 추가 (idempotent)
alter table subscriptions
  add column if not exists billing_key_id uuid references portone_billing_keys(id) on delete set null,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists last_renewed_at timestamptz;

-- portone_orders 컬럼 추가
alter table portone_orders
  add column if not exists order_type text not null default 'one_time',
  add column if not exists billing_key_id uuid references portone_billing_keys(id) on delete set null;
