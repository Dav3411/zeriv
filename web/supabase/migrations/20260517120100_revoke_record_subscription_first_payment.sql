-- ────────────────────────────────────────────────────────────────────────
-- CR-1 패치: record_subscription_first_payment RPC PUBLIC EXECUTE 회수
-- 2026-05-17 (H-1 RLS 패치 직후 순서: 120100)
--
-- 배경:
--   H-1 RLS 패치 (20260517120000_paypal_rls.sql) 검증 중 security-auditor
--   가 신규 CRITICAL 취약점을 보고. record_subscription_first_payment
--   RPC 는 다음 3가지 위험 요소가 결합되어 있음:
--
--     1. security definer (= 호출자 권한 무시, 함수 owner 권한으로 실행)
--     2. 인자 검증 없음 (p_user_id / p_credits 를 그대로 INSERT/UPDATE)
--     3. PUBLIC EXECUTE (PostgreSQL 함수 기본값)
--
--   결과: anon key 만 보유한 임의 호출자가
--     supabase.rpc('record_subscription_first_payment', {
--       p_subscription_id: '<arbitrary>',
--       p_user_id: '<VICTIM_UUID>',
--       p_plan_id: '<arbitrary>',
--       p_credits: 999999,
--       p_amount_usd: 0,
--       p_paid_at: '...',
--       p_paypal_sale_id: null
--     })
--   로 호출 시 함수 본문이 credit_wallets.balance 에 임의 정수를 가산
--   (라인 39~41). 결제 검증·웹훅 서명 검증 없이 누구나 무제한 크레딧
--   조작 가능 → 전 사용자 잔액 무결성 파괴 + 수익 손실.
--
--   H-1 (read-only IDOR) 보다 심각도 ↑ — write 가능.
--
-- 함수 시그니처 (web/sql/migration_new_project.sql L669~709,
--                 web/sql/record_subscription_first_payment.sql L5~13):
--   public.record_subscription_first_payment(
--     p_subscription_id text,
--     p_user_id uuid,
--     p_plan_id text,
--     p_credits integer,
--     p_amount_usd numeric,
--     p_paid_at timestamptz,
--     p_paypal_sale_id text default null
--   ) returns text
--   language plpgsql security definer
--
-- Fix:
--   PUBLIC / authenticated / anon 모두에서 execute 권한 회수.
--   PostgreSQL 함수 기본 grant 는 PUBLIC 이지만, Supabase 는 추가로
--   authenticated / anon 에도 grant 가 적용될 수 있어 명시적 revoke 3종.
--   service_role 은 BYPASSRLS + 함수 owner 권한이라 영향 없음.
--
-- 회귀 영향: 없음.
--   호출처 grep 결과 (web/src 전체):
--     web/src/app/api/credits/paypal/webhook/route.ts:171
--       → supabaseAdmin.rpc("record_subscription_first_payment", ...)
--     web/src/app/api/credits/paypal/complete/route.ts:136
--       → supabaseAdmin.rpc("record_subscription_first_payment", ...)
--   두 곳 모두 SUPABASE_SECRET_KEY (service_role) 사용. service_role 은
--   GRANT/REVOKE 영향 없음 (BYPASSRLS + 함수 소유자 권한).
--
-- Idempotency:
--   revoke 는 이미 회수된 권한에 대해 재실행해도 no-op (warning 만 출력).
--   function signature 는 반드시 정의와 정확히 일치해야 revoke 동작.
-- ────────────────────────────────────────────────────────────────────────

-- 환경별 안전성: 함수가 아직 정의되지 않았을 수 있으므로 DO 블록 +
-- EXCEPTION 으로 격리. 함수 부재 시 NOTICE 만 출력하고 통과 (이후 함수
-- 정의 마이그레이션 적용 시 그 안의 revoke 로 권한 회수 보장).
do $$
begin
  revoke execute on function public.record_subscription_first_payment(
    text, uuid, text, integer, numeric, timestamptz, text
  ) from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.record_subscription_first_payment(text, uuid, text, integer, numeric, timestamptz, text) does not exist — skipping';
end $$;

-- ────────────────────────────────────────────────────────────────────────
-- 검증용 쿼리 (수동 실행)
-- ────────────────────────────────────────────────────────────────────────
-- 권한 확인:
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name   = 'record_subscription_first_payment';
--   → PUBLIC / anon / authenticated 행이 없어야 함.
--     service_role 또는 함수 owner (postgres) 만 남아있어야 정상.
--
-- IDOR 차단 수동 확인 (publishable key 로 호출):
--   curl -X POST 'https://<project>.supabase.co/rest/v1/rpc/record_subscription_first_payment' \
--     -H "apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Content-Type: application/json" \
--     -d '{"p_subscription_id":"x","p_user_id":"<uuid>","p_plan_id":"x",
--          "p_credits":1,"p_amount_usd":0,"p_paid_at":"2026-05-17T00:00:00Z"}'
--   → 42501 permission denied for function record_subscription_first_payment
--     (이전: 200 OK + 크레딧 가산되어 buffer overflow 수준의 무한 발급 가능)
