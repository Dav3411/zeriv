-- Subscription Lifecycle (cancel / upgrade / downgrade)
-- 2026-04-28
--
-- Goal:
--   Stripe-style 라이프사이클을 PortOne KRW 구독에도 적용한다.
--     - 취소: 기간 만료 시 효력 (cancel_requested_at + auto_renew=false 조합)
--     - 업그레이드: 즉시 적용 + 일할 차액 청구 (별도 컬럼 X — 즉시 plan 변경)
--     - 다운그레이드: 다음 결제일 적용 (pending_plan / pending_plan_tier / pending_change_at)
--
-- Idempotency:
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   - 제약은 catalog 조회 후 없을 때만 추가
--
-- RLS:
--   subscriptions 는 "service role only" (using false). 새 컬럼은 자동 보호됨.
--   별도 정책 변경 불필요.

-- ────────────────────────────────────────────────────────────────────────
-- 1. subscriptions 컬럼 추가
-- ────────────────────────────────────────────────────────────────────────
alter table subscriptions
  add column if not exists pending_plan text,
  add column if not exists pending_plan_tier int,
  add column if not exists pending_change_at timestamptz,
  add column if not exists cancel_requested_at timestamptz;

-- ────────────────────────────────────────────────────────────────────────
-- 2. CHECK 제약: pending_plan_tier ∈ NULL ∪ [1..4]
-- ────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'subscriptions'
      and c.conname = 'subscriptions_pending_plan_tier_check'
  ) then
    alter table subscriptions
      add constraint subscriptions_pending_plan_tier_check
      check (pending_plan_tier is null or pending_plan_tier between 1 and 4);
  end if;
end$$;

-- ────────────────────────────────────────────────────────────────────────
-- 3. CHECK 제약: pending_plan 유효 값
-- ────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'subscriptions'
      and c.conname = 'subscriptions_pending_plan_check'
  ) then
    alter table subscriptions
      add constraint subscriptions_pending_plan_check
      check (pending_plan is null or pending_plan in ('free','starter','label','pro'));
  end if;
end$$;

-- ────────────────────────────────────────────────────────────────────────
-- 4. portone_orders.order_type — 신규 값 'upgrade_proration' 허용 보장
-- ────────────────────────────────────────────────────────────────────────
-- 현 스키마(20260423_portone_billing_keys.sql)에는 order_type 에 CHECK 제약이 없다.
-- 향후 다른 마이그레이션에서 CHECK 가 추가되어도 'upgrade_proration' 이 허용되도록
-- 제약을 명시적으로 정의/갱신한다.
do $$
declare
  existing_check name;
begin
  -- 기존에 order_type 에 걸린 CHECK 제약이 있으면 모두 드롭 (값 집합 단일 source of truth 보장)
  for existing_check in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a
      on a.attrelid = t.oid and a.attname = 'order_type'
    where t.relname = 'portone_orders'
      and c.contype = 'c'
      and a.attnum = any(c.conkey)
  loop
    execute format('alter table portone_orders drop constraint %I', existing_check);
  end loop;

  alter table portone_orders
    add constraint portone_orders_order_type_check
    check (order_type in (
      'one_time',
      'subscription',
      'billing_first',
      'billing_renewal',
      'upgrade_proration'
    ));
end$$;

-- ────────────────────────────────────────────────────────────────────────
-- 5. 인덱스 — pending_change_at 도래 구독 빠른 조회 (cron 에서 사용)
-- ────────────────────────────────────────────────────────────────────────
create index if not exists subscriptions_pending_change_idx
  on subscriptions(pending_change_at)
  where pending_plan is not null;

-- ────────────────────────────────────────────────────────────────────────
-- 6. 인덱스 — 만료 sweep용 (auto_renew=false + cancel_requested_at NOT NULL + period 지난 active)
--    cron 의 sweep 쿼리(cron/billing-renewal)와 정확히 동일한 조건의 partial index.
--    auto_renew=false 만 본 인덱스는 결제 실패 케이스도 포함하므로
--    cancel_requested_at IS NOT NULL 조건을 함께 걸어 의도한 데이터셋만 포함시킨다.
-- ────────────────────────────────────────────────────────────────────────
create index if not exists subscriptions_cancel_expiry_idx
  on subscriptions(current_period_end)
  where status = 'active'
    and auto_renew = false
    and cancel_requested_at is not null;
