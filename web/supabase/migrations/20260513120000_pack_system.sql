-- ────────────────────────────────────────────────────────────────────────
-- 이미지 장수 팩 (KRW 일회성 결제) 시스템 — Phase 1
-- 2026-05-13
--
-- Goal:
--   월구독 한도 소진 후 종량제 결제로 fallback 가능한 path 도입.
--   PayPal/credit 시스템(legacy)과 분리된 KRW 전용 path.
--
-- Strategy:
--   1) org_generation_packs — 활성 팩 잔량 관리 (FIFO by expires_at)
--   2) krw_pack_orders — PortOne KRW 결제 주문 (merchant_uid UNIQUE)
--   3) consume_from_pack RPC — race condition 방지 atomic 차감
--      (FOR UPDATE SKIP LOCKED 으로 동시 다중 차감 직렬화)
--
-- Idempotency:
--   IF NOT EXISTS / DROP POLICY IF EXISTS 패턴으로 재실행 안전.
-- ────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────
-- 1. org_generation_packs — 활성 팩 잔량
-- ────────────────────────────────────────────────────────────────────────
-- source:
--   krw_purchase  — KRW 결제로 충전 (krw_pack_orders.id 참조)
--   admin_grant   — admin 수동 지급 (expires_at NULL 가능)
--   promo         — 프로모션/이벤트 (expires_at NOT NULL 권장)
--
-- remaining_count 0 인 row 도 archive 목적으로 유지 (감사/통계).
-- 활성 조회는 idx_packs_org_active partial index 로 빠르게.

create table if not exists org_generation_packs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source          text not null check (source in ('krw_purchase','admin_grant','promo')),
  source_ref_id   uuid,
  initial_count   int  not null check (initial_count > 0),
  remaining_count int  not null check (remaining_count >= 0),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint remaining_le_initial check (remaining_count <= initial_count)
);

create index if not exists idx_packs_org_active
  on org_generation_packs(organization_id, expires_at nulls last, created_at)
  where remaining_count > 0;

create index if not exists idx_packs_source_ref
  on org_generation_packs(source_ref_id)
  where source_ref_id is not null;

-- race condition 방지: 동일 KRW 결제(source_ref_id)로 팩이 두 번 적립되는 것을 DB 레벨에서 차단.
-- partial index 라 krw_purchase 이외 source(admin_grant, promo)는 영향 없음.
create unique index if not exists idx_packs_source_ref_unique
  on org_generation_packs(source_ref_id)
  where source_ref_id is not null and source = 'krw_purchase';

-- ────────────────────────────────────────────────────────────────────────
-- 2. krw_pack_orders — KRW 결제 주문
-- ────────────────────────────────────────────────────────────────────────
-- pack_size: 1 / 10 / 30 / 100 (서버에서 amount_krw 매핑 검증)
-- merchant_uid: PortOne UNIQUE 식별자. 23505 collision → 동시 결제 차단.
-- status:
--   pending   — 결제창 노출 직전 insert
--   paid      — PortOne 검증 성공 + org_generation_packs insert 완료
--   failed    — 결제 실패 또는 검증 실패
--   refunded  — 환불 완료
--
-- expires_at 은 주문 시점에 결정해 둔다. 결제 완료 후
-- org_generation_packs.expires_at 로 복사. 환불 시 재참조용.

create table if not exists krw_pack_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),
  organization_id uuid not null references organizations(id),
  merchant_uid    text unique not null,
  amount_krw      int  not null check (amount_krw > 0),
  pack_size       int  not null check (pack_size > 0),
  expires_at      timestamptz not null,
  status          text not null default 'pending'
    check (status in ('pending','paid','failed','refunded')),
  pg_tid          text,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  refund_reason   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_pack_orders_user
  on krw_pack_orders(user_id, created_at desc);

-- pending 결제 polling/sweep 용 — partial index 로 작게 유지
create index if not exists idx_pack_orders_pending
  on krw_pack_orders(merchant_uid) where status = 'pending';

create index if not exists idx_pack_orders_org
  on krw_pack_orders(organization_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- 3. consume_from_pack RPC — atomic FIFO 차감
-- ────────────────────────────────────────────────────────────────────────
-- 동시 차감 시 race condition 차단:
--   - FOR UPDATE SKIP LOCKED 로 한 row 를 잠근 다른 세션은 다음 row 시도
--   - 잔량 1 + 동시 요청 2 → 한 요청만 성공, 다른 요청은 FALSE
--
-- ORDER BY expires_at NULLS LAST: 만료 임박 팩 우선 소진
--   - NULL(무기한, admin_grant) 은 가장 마지막에 차감
--
-- SECURITY DEFINER: service_role 에서만 호출 (RLS 우회).
-- search_path 명시: 권한 상승 차단.

create or replace function consume_from_pack(p_org_id uuid)
returns boolean
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
    return false;
  end if;

  update org_generation_packs
  set remaining_count = remaining_count - 1
  where id = v_pack_id;

  return true;
end;
$$;

revoke all on function consume_from_pack(uuid) from public;
grant execute on function consume_from_pack(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 4. RLS — service_role 만 허용 (publishable key 직접 접근 차단)
-- ────────────────────────────────────────────────────────────────────────
-- 클라이언트는 자기 org 팩 조회를 위해 /api/packs/list 를 거치도록 강제.
-- 직접 PostgREST 접근은 publishable key 가 유출돼도 빈 결과를 반환.
-- portone_orders / organizations 와 동일한 패턴.

alter table org_generation_packs enable row level security;
alter table krw_pack_orders       enable row level security;

drop policy if exists "service role only" on org_generation_packs;
create policy "service role only" on org_generation_packs using (false);

drop policy if exists "service role only" on krw_pack_orders;
create policy "service role only" on krw_pack_orders using (false);

-- ────────────────────────────────────────────────────────────────────────
-- 5. 검증용 쿼리 (수동 실행 — 마이그레이션 자체에서는 실행되지 않음)
-- ────────────────────────────────────────────────────────────────────────
-- RLS 활성화 확인:
--   select relname, relrowsecurity from pg_class
--   where relname in ('org_generation_packs','krw_pack_orders');
--
-- RPC 권한 확인:
--   select proname, prosecdef, provolatile, proconfig
--   from pg_proc where proname = 'consume_from_pack';
--   -- prosecdef = true, provolatile = 'v' (volatile, 부수효과 UPDATE),
--   -- proconfig = {search_path=public}
--
-- race condition 시나리오 수동 검증:
--   -- 세션 A
--   begin; select consume_from_pack('<org_id>'::uuid); -- true (lock held)
--   -- 세션 B (동시)
--   begin; select consume_from_pack('<org_id>'::uuid); -- 잔량 1 일 때 false
--   -- 세션 A
--   commit;
