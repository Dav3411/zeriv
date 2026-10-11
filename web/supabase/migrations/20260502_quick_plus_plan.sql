-- Quick Plus 플랜 추가 — pending_plan CHECK 제약 확장
-- 2026-05-02
--
-- Goal:
--   1인 셀러 진입 플랜 'quick_plus' 를 새로 도입한다 (₩9,900/월).
--   subscriptions.plan 컬럼은 text(no CHECK)이라 별도 제약 없음.
--   subscriptions.pending_plan 컬럼에는 CHECK 제약이 걸려 있어
--   Atelier→Quick Plus 다운그레이드 시 INSERT 가 실패할 수 있다.
--   이 제약에 'quick_plus' 를 추가한다.
--
-- Idempotency:
--   기존 제약을 catalog 조회 후 드롭하고 동일 이름으로 재생성한다.
--   pending_plan 컬럼 자체는 20260428_subscription_lifecycle.sql 에서 추가됨.
--
-- 회귀 위험:
--   기존 'free','starter','label','pro' 값은 그대로 유지되므로 기존 사용자에게
--   영향 없음. 신규 'quick_plus' 만 추가 허용.

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'subscriptions'
      and c.conname = 'subscriptions_pending_plan_check'
  ) then
    alter table subscriptions
      drop constraint subscriptions_pending_plan_check;
  end if;

  alter table subscriptions
    add constraint subscriptions_pending_plan_check
    check (
      pending_plan is null
      or pending_plan in ('free', 'quick_plus', 'starter', 'label', 'pro')
    );
end$$;
