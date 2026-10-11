create table if not exists portone_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_uid text unique not null,
  imp_uid text,
  brand_id uuid references brands(id) on delete cascade,
  user_id uuid references auth.users(id),
  plan_key text not null,
  amount_krw integer not null,
  status text not null default 'pending', -- pending/paid/failed/cancelled
  paid_at timestamptz,
  pg_raw jsonb,
  created_at timestamptz default now()
);

alter table portone_orders enable row level security;
create policy "service role only" on portone_orders using (false);
