-- ────────────────────────────────────────────────────────────────────────
-- H-1 패치: PayPal legacy 테이블 RLS 활성화 (service_role 전용)
-- 2026-05-17
--
-- 배경:
--   security-auditor (S2-1 [H-1]) 가 web/sql/paypal_orders.sql 및
--   web/sql/paypal_subscriptions.sql 의 RLS 누락을 식별. publishable key
--   (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) 로 PostgREST 직접 접근 시
--   임의 user_id 의 paypal_orders / paypal_subscriptions 행을 select 가능
--   → read-only IDOR (order_id, credits, amount_usd, plan_id, status,
--      captured_at, subscription_id 등 결제 PII 노출).
--
--   web/sql/migration_new_project.sql 통합 스크립트에는 이미 RLS 가
--   활성화되어 있으나, web/sql/paypal_*.sql 파일만 따로 실행한 환경
--   (조기 인스턴스) 에서는 RLS off 인 상태로 남아있을 수 있어
--   마이그레이션으로 강제 적용.
--
-- 패턴 (PortOne / pack_system 컨벤션 동일):
--   - alter table ... enable row level security
--   - drop policy if exists "service role only" on <table> (idempotent)
--   - create policy "service role only" on <table> using (false)
--   정책이 모든 row 를 거부하므로 anon/authenticated 키는 빈 결과만 반환.
--   service_role 은 BYPASSRLS 권한이 있어 정상 작동.
--
-- 회귀 영향:
--   web/src 의 모든 paypal_orders / paypal_subscriptions /
--   paypal_subscription_payments 접근 지점은 supabaseAdmin
--   (SUPABASE_SECRET_KEY = service_role) 을 사용함을 확인했으므로
--   RLS 활성화로 인한 결제 흐름 회귀 없음.
--   확인 지점:
--     web/src/app/api/credits/checkout/route.ts
--     web/src/app/api/credits/checkout-onetime/route.ts
--     web/src/app/api/credits/paypal/complete/route.ts
--     web/src/app/api/credits/paypal/complete-onetime/route.ts
--     web/src/app/api/credits/paypal/webhook/route.ts
--     web/src/app/api/credits/subscription/cancel/route.ts
--     web/src/app/api/credits/usage/route.ts
--     web/src/app/api/admin/stats/plan-payments/route.ts
--     web/src/lib/paypalCustomId.ts
--     web/src/lib/subscriptionPlan.ts
--
-- Idempotency:
--   alter table ... enable rls 는 이미 활성화된 테이블에 재실행해도
--   no-op. drop policy if exists / create policy 패턴은 PortOne 컨벤션
--   그대로 따른다.
-- ────────────────────────────────────────────────────────────────────────

-- paypal_orders
alter table public.paypal_orders enable row level security;
drop policy if exists "service role only" on public.paypal_orders;
create policy "service role only" on public.paypal_orders using (false);

-- paypal_subscriptions
alter table public.paypal_subscriptions enable row level security;
drop policy if exists "service role only" on public.paypal_subscriptions;
create policy "service role only" on public.paypal_subscriptions using (false);

-- paypal_subscription_payments
-- web/sql/paypal_subscription_payments.sql 에 이미 enable rls 가 있으나
-- 정책이 정의되어 있지 않아 정의를 명시적으로 추가 (PortOne 컨벤션 통일).
-- 정책 없는 RLS 와 using (false) 정책은 service_role 입장에서는 동일하게
-- 동작하지만, 명시적 정책이 있어야 운영 시 RLS 상태 점검 (pg_policies) 에서
-- "정책 없음" 으로 오해되지 않는다.
alter table public.paypal_subscription_payments enable row level security;
drop policy if exists "service role only" on public.paypal_subscription_payments;
create policy "service role only" on public.paypal_subscription_payments using (false);

-- ────────────────────────────────────────────────────────────────────────
-- 검증용 쿼리 (수동 실행 — 마이그레이션 자체에서는 실행되지 않음)
-- ────────────────────────────────────────────────────────────────────────
-- RLS 활성화 확인:
--   select relname, relrowsecurity from pg_class
--   where relname in (
--     'paypal_orders', 'paypal_subscriptions', 'paypal_subscription_payments'
--   );
--
-- 정책 확인:
--   select schemaname, tablename, policyname, qual
--   from pg_policies
--   where tablename in (
--     'paypal_orders', 'paypal_subscriptions', 'paypal_subscription_payments'
--   );
--
-- IDOR 차단 수동 확인 (publishable key 로 호출):
--   curl 'https://<project>.supabase.co/rest/v1/paypal_orders?user_id=eq.<uuid>' \
--     -H "apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>"
--   → 빈 배열 [] 반환되어야 함 (이전: 결제 PII 노출).
