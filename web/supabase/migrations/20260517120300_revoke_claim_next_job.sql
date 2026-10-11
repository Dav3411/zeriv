-- ────────────────────────────────────────────────────────────────────────
-- 가용성 위협 패치: claim_next_job PUBLIC EXECUTE 회수
-- 2026-05-17 (security-auditor 보고, 이번 세션 마지막 잔존 건)
--
-- 배경:
--   20260424_claim_next_job_rpc.sql 에 `grant execute to service_role` 만
--   있고 `revoke from public` 이 없어 PostgreSQL 기본 PUBLIC EXECUTE 가 잔존.
--   Supabase 환경에서 anon key 로
--     rpc('claim_next_job', { p_source: 'arbitrary' })
--   를 호출하면 queued 상태 job 1건이 status='processing', progress=5 로
--   전환되어 worker 가 가져갈 job 을 박탈. 신규 job 이 영원히 처리되지 않는
--   서비스 가용성 DoS 시나리오.
--
-- 함수 시그니처 (정의 위치):
--   public.claim_next_job(p_source text)
--     → web/supabase/migrations/20260424_claim_next_job_rpc.sql:1
--       (SECURITY DEFINER, UPDATE jobs status='processing')
--
-- 회귀 영향 평가 (단계 2 grep 결과):
--   web/src + web/scripts 전체 grep `rpc\(['"]claim_next_job` 결과 1건:
--     web/scripts/worker.mjs:253
--     → supabase = createClient(supabaseUrl, secretKey) (L44)
--       secretKey = SUPABASE_SECRET_KEY (L26) = service_role
--   anon / authenticated 호출처 0건 → revoke 후 회귀 없음.
--
-- web/sql/ 중복 정의:
--   grep 결과 0건 → 해당 없음.
--
-- Idempotency:
--   revoke 는 이미 회수된 권한에 대해 재실행해도 no-op (warning 만 출력).
--   function signature 는 정의와 정확히 일치해야 revoke 가 대상 함수를 식별.
--
-- 검증용 쿼리 (수동 실행):
--   select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name = 'claim_next_job'
--   order by grantee;
--   → PUBLIC / anon / authenticated 행이 없어야 함.
--     service_role / postgres 만 남아있어야 정상.
--
--   실제 차단 확인 (anon key 로 호출):
--   curl -X POST 'https://<project>.supabase.co/rest/v1/rpc/claim_next_job' \
--     -H "apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>" \
--     -H "Content-Type: application/json" \
--     -d '{"p_source":"image"}'
--   → 42501 permission denied for function claim_next_job
-- ────────────────────────────────────────────────────────────────────────

-- 환경별 안전성: 함수가 아직 정의되지 않았을 수 있으므로 DO 블록 +
-- EXCEPTION 으로 격리 (다른 마이그레이션과 일관).
do $$
begin
  revoke execute on function public.claim_next_job(text)
    from public, authenticated, anon;
exception
  when undefined_function then
    raise notice 'Function public.claim_next_job(text) does not exist — skipping';
end $$;
