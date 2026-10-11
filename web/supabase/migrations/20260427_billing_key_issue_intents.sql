-- billing_key_issue_intents
-- PortOne V1 빌링키 발급 의도(intent)를 서버에서 미리 발급/검증하기 위한 매핑 테이블.
--
-- 목적:
--   - 클라이언트가 customer_uid / merchant_uid를 임의로 만들지 못하게 한다 (IDOR 방지)
--   - issue 라우트의 멱등성 키로 활용한다 (이중 청구 방지)
--   - redirect URL에 customer_uid 평문 노출을 막고 intent_id 단일 키로만 진입하게 한다
--
-- 흐름:
--   1) 클라이언트가 /api/portone/billing-key/prepare 호출
--      → 서버는 brand 소유권 + organization 권한 검증 후
--        customer_uid / merchant_uid 를 서버에서 생성하여 이 테이블에 'pending' 으로 insert
--   2) 결제창 결과가 돌아오면 클라이언트가 /api/portone/billing-key/issue 를 호출
--      → 라우트는 intent_id 또는 (customerUid + merchantUid) 로 행 조회 + 소유권 검증
--      → status='pending' 행만 처리 가능. atomic update 로 동시 호출 race 차단
--      → 처리 성공 후 'completed' 마킹 → 동일 customer_uid 재호출 시 idempotent 응답
--
-- RLS:
--   service_role 만 read/write 가능. 일반 user는 직접 접근 불가.

create table if not exists billing_key_issue_intents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  brand_id        uuid not null references brands(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_key        text not null,
  plan_tier       int  not null default 1,
  customer_uid    text not null unique,
  merchant_uid    text not null unique,
  status          text not null default 'pending'
                    check (status in ('pending','completed','failed','completed_with_warning')),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists billing_key_issue_intents_user_id_idx
  on billing_key_issue_intents(user_id);
create index if not exists billing_key_issue_intents_status_idx
  on billing_key_issue_intents(status) where status = 'pending';
create index if not exists billing_key_issue_intents_customer_uid_idx
  on billing_key_issue_intents(customer_uid);

alter table billing_key_issue_intents enable row level security;

drop policy if exists "service role only" on billing_key_issue_intents;
create policy "service role only" on billing_key_issue_intents using (false);
