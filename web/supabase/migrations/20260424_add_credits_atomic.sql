create or replace function public.add_credits_atomic(
  p_user_id uuid,
  p_amount integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_wallets (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id) do update
    set balance = public.credit_wallets.balance + p_amount,
        updated_at = now();
end;
$$;

-- PUBLIC EXECUTE 회수 (CR-1 후속 패치, 2026-05-17).
-- 셋업 일관성을 위해 함수 정의 직후 권한 회수.
-- 회수 사유 및 회귀 영향은
--   web/supabase/migrations/20260517120200_revoke_credit_rpc_public_execute.sql
-- 참고.
revoke execute on function public.add_credits_atomic(uuid, integer) from public;
revoke execute on function public.add_credits_atomic(uuid, integer) from authenticated;
revoke execute on function public.add_credits_atomic(uuid, integer) from anon;
grant execute on function public.add_credits_atomic(uuid, integer) to service_role;
