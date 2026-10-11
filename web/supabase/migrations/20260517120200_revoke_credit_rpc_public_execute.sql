-- ────────────────────────────────────────────────────────────────────────
-- CR-1 후속 패치: 크레딧/리워드 RPC 8종 PUBLIC EXECUTE 일괄 회수
-- 2026-05-17 (record_subscription_first_payment revoke 직후 순서: 120200)
--
-- 배경:
--   20260517120100_revoke_record_subscription_first_payment.sql 적용 후
--   security-auditor 가 동일 패턴 (SECURITY DEFINER + 인자 검증 없음 +
--   PUBLIC EXECUTE 잔존 OR INVOKER + PUBLIC EXECUTE) 으로 추가 8종을 발견.
--
--   PostgreSQL 함수 기본 grant 는 PUBLIC EXECUTE. Supabase 환경에서는
--   anon / authenticated 도 supabase.rpc(name, args) 로 직접 호출 가능.
--   SECURITY DEFINER 함수는 호출자 권한과 무관하게 owner 권한으로 실행되어
--   credit_wallets 등 보호된 테이블을 임의 변조할 수 있음.
--   INVOKER 함수도 RLS 가 모든 변조 시나리오를 막아준다는 보장이 없으므로
--   defense-in-depth 차원에서 PUBLIC EXECUTE 를 회수.
--
-- 회귀 영향 평가:
--   web/src 및 web/scripts 전체 grep 결과 모든 호출처가 service_role 사용.
--   service_role 은 BYPASSRLS + 함수 owner 권한이라 revoke 영향 없음.
--
--   호출처 매트릭스 (2026-05-17 grep 기준):
--     H-2 claim_onboarding_step   → (호출처 0건, dead code)
--     H-3 add_credits_atomic      → web/src/app/api/credits/paypal/webhook/route.ts:13
--                                   web/src/app/api/credits/paypal/complete/route.ts:39
--                                   web/src/app/api/credits/paypal/complete-onetime/route.ts:11
--                                   web/src/app/api/admin/users/credits/route.ts:81
--                                   (모두 supabaseAdmin = service_role)
--     H-4 reserve_job_credits     → web/src/app/api/personas/create-job/route.ts:251
--                                   (supabaseAdmin = service_role)
--     release_job_credits         → web/src/app/api/personas/create-job/route.ts:334
--                                   web/scripts/worker.mjs:270 (SUPABASE_SECRET_KEY)
--                                   (모두 service_role)
--     deduct_agent_credits        → (호출처 0건, dead code)
--     refund_agent_credits        → (호출처 0건, dead code)
--     increment_credit_balance    → (호출처 0건, dead code)
--     deduct_reward_balance       → (호출처 0건, dead code)
--
--   ※ 원 보고서는 release_job_credits 를 dead 로 분류했으나 재검증 결과
--     활성 호출처 2건이 있음. 두 호출처 모두 service_role 이라 revoke 후
--     회귀 없음. 보고 정정.
--
-- 함수 시그니처 (정의 위치):
--   public.claim_onboarding_step(uuid, text, integer)
--     → web/supabase/migrations/20260414_onboarding_rewards.sql:22-54
--       (SECURITY DEFINER, INSERT onboarding_rewards_claimed + credit_wallets)
--   public.add_credits_atomic(uuid, integer)
--     → web/supabase/migrations/20260424_add_credits_atomic.sql:1-16
--       (SECURITY DEFINER, INSERT/UPDATE credit_wallets)
--   public.reserve_job_credits(uuid, uuid, integer)
--     → web/sql/migration_new_project.sql:511-546
--       web/sql/credit_wallets_balance_non_negative.sql:12-44 (재정의)
--       (INVOKER, INSERT/UPDATE credit_wallets + INSERT credit_ledger)
--   public.release_job_credits(uuid)
--     → web/sql/migration_new_project.sql:549-570
--       (INVOKER, UPDATE credit_wallets + UPDATE credit_ledger)
--   public.deduct_agent_credits(uuid, uuid, integer)
--     → web/sql/migration_new_project.sql:573-606
--       (INVOKER, UPDATE credit_wallets + INSERT credit_ledger)
--   public.refund_agent_credits(uuid, uuid, integer)
--     → web/sql/migration_new_project.sql:609-626
--       (INVOKER, UPDATE credit_wallets + INSERT credit_ledger)
--   public.increment_credit_balance(uuid, integer)
--     → web/sql/migration_new_project.sql:629-640
--       (INVOKER, INSERT/UPDATE credit_wallets)
--   public.deduct_reward_balance(uuid, numeric)
--     → web/sql/migration_new_project.sql:643-669
--       (INVOKER, UPDATE user_wallets)
--
-- Idempotency 및 환경별 안전성:
--   revoke 는 이미 회수된 권한에 대해 재실행해도 no-op (warning 만 출력).
--   function signature 는 정의와 정확히 일치해야 revoke 가 대상 함수를 식별.
--
--   환경에 따라 일부 함수(특히 dead code)가 아직 정의되지 않았을 수 있음.
--   42883 (undefined_function) 발생 시 전체 트랜잭션 rollback 을 피하기 위해
--   각 revoke 를 DO 블록 + EXCEPTION 으로 격리. 함수 부재 시 NOTICE 만 출력하고
--   다음 함수 처리를 계속한다. 이후 해당 함수 정의 마이그레이션이 적용되면
--   그 마이그레이션 내부의 revoke 로 권한 회수가 보장된다 (셋업 일관성 보강).
--
-- 향후 권고 (이번 마이그레이션 범위 외):
--   1. reserve_job_credits / release_job_credits 를 SECURITY DEFINER 로
--      변경 + 함수 본문에 auth.uid() 가드 추가 → service_role 외 호출 차단
--      후에도 RLS 우회 없이 안전.
--   2. dead RPC 5종 (deduct_agent_credits / refund_agent_credits /
--      increment_credit_balance / deduct_reward_balance / claim_onboarding_step)
--      은 DROP FUNCTION 검토 — 현 마이그레이션은 권한만 회수.
-- ────────────────────────────────────────────────────────────────────────

-- ── H-2: claim_onboarding_step (dead) ──────────────────────────────────
do $$
begin
  revoke execute on function public.claim_onboarding_step(uuid, text, integer)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.claim_onboarding_step(uuid, text, integer) does not exist — skipping (will be revoked when 20260414_onboarding_rewards.sql is applied)';
end $$;

-- ── H-3: add_credits_atomic (active, 결제 흐름) ────────────────────────
do $$
begin
  revoke execute on function public.add_credits_atomic(uuid, integer)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.add_credits_atomic(uuid, integer) does not exist — skipping';
end $$;

-- ── H-4: reserve_job_credits (active, persona job) ─────────────────────
do $$
begin
  revoke execute on function public.reserve_job_credits(uuid, uuid, integer)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.reserve_job_credits(uuid, uuid, integer) does not exist — skipping';
end $$;

-- ── release_job_credits (active, persona job rollback + worker) ────────
do $$
begin
  revoke execute on function public.release_job_credits(uuid)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.release_job_credits(uuid) does not exist — skipping';
end $$;

-- ── Dead RPC 4종 (호출처 0건) ──────────────────────────────────────────
do $$
begin
  revoke execute on function public.deduct_agent_credits(uuid, uuid, integer)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.deduct_agent_credits(uuid, uuid, integer) does not exist — skipping';
end $$;

do $$
begin
  revoke execute on function public.refund_agent_credits(uuid, uuid, integer)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.refund_agent_credits(uuid, uuid, integer) does not exist — skipping';
end $$;

do $$
begin
  revoke execute on function public.increment_credit_balance(uuid, integer)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.increment_credit_balance(uuid, integer) does not exist — skipping';
end $$;

do $$
begin
  revoke execute on function public.deduct_reward_balance(uuid, numeric)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.deduct_reward_balance(uuid, numeric) does not exist — skipping';
end $$;

-- ────────────────────────────────────────────────────────────────────────
-- 검증용 쿼리 (수동 실행)
-- ────────────────────────────────────────────────────────────────────────
-- 권한 확인:
--   select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name in (
--       'claim_onboarding_step', 'add_credits_atomic',
--       'reserve_job_credits', 'release_job_credits',
--       'deduct_agent_credits', 'refund_agent_credits',
--       'increment_credit_balance', 'deduct_reward_balance'
--     )
--   order by routine_name, grantee;
--   → PUBLIC / anon / authenticated 행이 없어야 함.
--     service_role / postgres 만 남아있어야 정상.
--
-- 실제 차단 확인 (publishable key 로 호출):
--   curl -X POST 'https://<project>.supabase.co/rest/v1/rpc/add_credits_atomic' \
--     -H "apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Content-Type: application/json" \
--     -d '{"p_user_id":"<uuid>","p_amount":999999}'
--   → 42501 permission denied for function add_credits_atomic
