-- 온보딩 보상 수령 이력
CREATE TABLE IF NOT EXISTS public.onboarding_rewards_claimed (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  credits_granted integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, step_key)
);

ALTER TABLE public.onboarding_rewards_claimed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding rewards"
  ON public.onboarding_rewards_claimed FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role only insert"
  ON public.onboarding_rewards_claimed FOR INSERT
  WITH CHECK (false);

-- INSERT + 크레딧 지급을 하나의 트랜잭션으로 처리
-- Returns: true = 새로 지급됨, false = 이미 수령 (중복)
CREATE OR REPLACE FUNCTION public.claim_onboarding_step(
  p_user_id uuid,
  p_step_key text,
  p_credits integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  INSERT INTO public.onboarding_rewards_claimed (user_id, step_key, credits_granted)
  VALUES (p_user_id, p_step_key, p_credits)
  ON CONFLICT (user_id, step_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  -- ROW_COUNT: 1이면 새로 삽입, 0이면 중복

  IF NOT v_inserted THEN
    RETURN false;
  END IF;

  -- 크레딧 지갑 upsert 후 증가
  INSERT INTO public.credit_wallets (user_id, balance, updated_at)
  VALUES (p_user_id, p_credits, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance = credit_wallets.balance + EXCLUDED.balance,
        updated_at = now();

  RETURN true;
END;
$$;

-- PUBLIC EXECUTE 회수 (CR-1 후속 패치, 2026-05-17).
-- 셋업 일관성을 위해 함수 정의 직후 권한 회수.
-- 회수 사유 및 회귀 영향은
--   web/supabase/migrations/20260517120200_revoke_credit_rpc_public_execute.sql
-- 참고.
REVOKE EXECUTE ON FUNCTION public.claim_onboarding_step(uuid, text, integer)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_onboarding_step(uuid, text, integer)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_onboarding_step(uuid, text, integer)
  FROM anon;
