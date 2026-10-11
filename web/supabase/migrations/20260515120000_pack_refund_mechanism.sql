-- ────────────────────────────────────────────────────────────────────────
-- 이미지 1장 환불 메커니즘 — Pack System Phase 2
-- 2026-05-15 (2026-05-13 _pack_system.sql 의 후속 마이그레이션)
--
-- Goal:
--   /api/render/create-job 의 각 핸들러에서 차감(consume) 직후 job insert
--   또는 R2 업로드가 실패하면 1장이 누수된다. 이를 보상하기 위한 atomic
--   환불 경로를 추가한다.
--
-- Strategy:
--   1) consume_from_pack RPC 반환을 boolean → uuid (차감된 pack_id) 로 변경.
--      어느 pack 에서 차감됐는지 알아야 동일 pack 으로 환불할 수 있다.
--   2) refund_to_pack(p_pack_id uuid) RPC 신설. remaining_count + 1 하되
--      initial_count 초과 방지(idempotent — 동일 ConsumeOk 로 두 번 호출돼도
--      안전). 단일 UPDATE 문이 자동으로 row-level lock 을 획득하므로 동시 환불
--      도 자연 직렬화 (명시적 SELECT FOR UPDATE 불필요).
--
-- Idempotency:
--   DROP FUNCTION IF EXISTS / CREATE OR REPLACE 패턴으로 재실행 안전.
--   consume_from_pack 시그니처 변경(return type boolean → uuid)은 CREATE OR
--   REPLACE 만으로는 불가능 — DROP 후 CREATE 가 강제된다.
--
-- 호출자 책임:
--   - service_role 만 execute. publishable key 직접 호출 차단(RLS + grant).
--   - refund_to_pack 실패(false 반환) 시 caller 가 critical 로그 남겨
--     운영자가 수동 보상 가능하도록 한다.
-- ────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────
-- 1. consume_from_pack — 반환 타입 변경 (boolean → uuid)
-- ────────────────────────────────────────────────────────────────────────
-- 변경된 시그니처:
--   returns uuid  -- 차감된 pack 의 id (null 이면 잔량 0 / 모든 팩 만료)
--
-- 사용처:
--   const { data, error } = await supabaseAdmin.rpc('consume_from_pack', { p_org_id });
--   if (data === null) { /* INSUFFICIENT_PACK */ } else { packId = data; }
--
-- race condition 보장은 기존과 동일:
--   FOR UPDATE SKIP LOCKED 로 동일 pack row 를 두 세션이 동시에 차감하는 것을 직렬화.
--   잔량 1, 동시 요청 2 → 한 요청만 uuid 받음, 다른 요청은 다음 row 시도(없으면 null).

drop function if exists consume_from_pack(uuid);

create or replace function consume_from_pack(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
begin
  select id into v_pack_id
  from org_generation_packs
  where organization_id = p_org_id
    and remaining_count > 0
    and (expires_at is null or expires_at > now())
  order by expires_at nulls last, created_at
  limit 1
  for update skip locked;

  if v_pack_id is null then
    return null;
  end if;

  update org_generation_packs
  set remaining_count = remaining_count - 1
  where id = v_pack_id;

  return v_pack_id;
end;
$$;

revoke all on function consume_from_pack(uuid) from public;
grant execute on function consume_from_pack(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 2. refund_to_pack — 1장 환불 (idempotent)
-- ────────────────────────────────────────────────────────────────────────
-- 반환:
--   true  — 환불 성공 (remaining_count 가 1 증가)
--   false — 환불 무시 (이미 initial_count 까지 차 있거나 row 없음)
--
-- Idempotency 보장:
--   update ... where remaining_count + 1 <= initial_count 가드.
--   동일 ConsumeOk 로 두 번 환불 호출되어도 두 번째는 noop (false 반환).
--
-- race condition:
--   단일 UPDATE 문은 PostgreSQL 의 implicit exclusive row lock 을 획득하므로
--   같은 row 에 대한 동시 환불은 자동으로 직렬화된다 (SELECT FOR UPDATE 불필요).
--   환불은 차감과 달리 동시성이 낮아 SKIP LOCKED 가 아닌 자연 대기 동작 OK.
--
-- 운영 노트:
--   refund_to_pack 가 false 를 반환하는 정상 경우는 거의 없다. 만약 false 가
--   잦다면 (a) 클라가 중복 환불을 시도하거나 (b) initial_count 가 잘못
--   기록된 상태. 둘 다 운영 대응 필요.

create or replace function refund_to_pack(p_pack_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update org_generation_packs
  set remaining_count = remaining_count + 1
  where id = p_pack_id
    and remaining_count + 1 <= initial_count;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function refund_to_pack(uuid) from public;
grant execute on function refund_to_pack(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 3. decrement_org_generation_count — 월 카운터 -1 (환불용)
-- ────────────────────────────────────────────────────────────────────────
-- usage_counters 의 org-마스터 row(brand_id IS NULL) 의 generations 를 1 감소.
--
-- 멱등성·정합성:
--   greatest(generations - 1, 0) 으로 음수 방지 (clamp).
--   row 가 없으면 noop — 새로 만들지 않는다 (increment 와 비대칭이지만 의도된 동작:
--   환불은 차감이 일어난 row 에 대해서만 의미가 있다).
--
-- race condition:
--   단일 UPDATE 문 내에서 atomic — SELECT-then-UPDATE 가 아니므로 race 없음.
--
-- security_definer + search_path: 권한 상승 차단. service_role 만 실행.

create or replace function decrement_org_generation_count(
  p_org_id uuid,
  p_year_month text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update usage_counters
  set generations = greatest(generations - 1, 0)
  where organization_id = p_org_id
    and brand_id is null
    and year_month = p_year_month;
end;
$$;

revoke all on function decrement_org_generation_count(uuid, text) from public;
grant execute on function decrement_org_generation_count(uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 4. 검증용 쿼리 (수동 실행 — 마이그레이션 자체에서는 실행되지 않음)
-- ────────────────────────────────────────────────────────────────────────
-- 시그니처 변경 확인:
--   select proname, pg_get_function_result(oid) as returns
--   from pg_proc where proname in
--     ('consume_from_pack','refund_to_pack','decrement_org_generation_count');
--   -- consume_from_pack:              returns uuid
--   -- refund_to_pack:                 returns boolean
--   -- decrement_org_generation_count: returns void
--
-- 권한 확인:
--   select proname, prosecdef, provolatile, proconfig
--   from pg_proc where proname in
--     ('consume_from_pack','refund_to_pack','decrement_org_generation_count');
--   -- prosecdef = true (SECURITY DEFINER), proconfig = {search_path=public}
--
-- Idempotency 시나리오 수동 검증:
--   -- 잔량이 initial_count 와 같은 row 에 환불 시도 → false
--   select refund_to_pack('<pack_id>'::uuid); -- false (이미 가득)
--
-- race condition 시나리오 수동 검증:
--   -- 세션 A
--   begin; select refund_to_pack('<pack_id>'::uuid); -- true, lock held
--   -- 세션 B (동시, 같은 pack)
--   begin; select refund_to_pack('<pack_id>'::uuid); -- A commit 까지 대기
--   -- A commit → B 가 다시 평가, initial 초과 시 false (idempotent 보장)
