-- portone_billing_keys.pg_delete_pending
-- PG(아임포트) 측 customer_uid 삭제가 실패한 경우, 좀비 빌링키가 남는 것을 방지하기 위한 재시도 큐 플래그.
--
-- 시나리오:
--   1) issue 라우트 또는 cancel 플로우에서 deleteCustomerUid() 호출 실패 (네트워크/일시 장애)
--   2) DB는 status='expired' 로 마킹되어 더 이상 청구되지 않지만, PortOne 콘솔에는 빌링키가 남아있어
--      누군가 customer_uid 를 알면 직접 청구할 수 있는 잠재적 위험이 존재.
--   3) 이 컬럼을 true 로 마킹해 두면, billing-renewal cron(또는 별도 job)에서 주기적으로 재시도해
--      PortOne 측 키를 정리한다.
--
-- 멱등:
--   - DEFAULT false. 신규 행은 영향 없음.
--   - 이미 컬럼이 있는 환경에서도 add column if not exists 로 안전.

alter table portone_billing_keys
  add column if not exists pg_delete_pending boolean not null default false;

create index if not exists portone_billing_keys_pg_delete_pending_idx
  on portone_billing_keys(pg_delete_pending) where pg_delete_pending = true;
