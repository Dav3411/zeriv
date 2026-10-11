-- UX-1 (Phase 4): billing-key/issue 라우트 PG 일시 장애 시 사용자 재시도 루프 방지
--
-- 배경:
--   기존 흐름은 PortOne 일시 장애가 발생하면 502 를 반환하고 intent.status 를 'pending'
--   으로 유지했다. 이 때문에 사용자가 결제 결과 페이지에서 즉시 재시도하면 같은 PG 장애로
--   같은 throw 가 반복되어 502 가 무한히 응답되었다 (PG·서버 부담 + 사용자 fatigue).
--
-- 변경:
--   intent.status 에 'pg_checking' 중간 상태를 추가한다. 흐름:
--     pending  ─(정상)──────────────> completed / completed_with_warning
--             └(PG 일시 장애)─────> pg_checking ─(sweep 회복)──> completed / failed
--
--   issue 라우트는 status='pg_checking' 진입을 즉시 503 + 안내 코드로 차단하여 사용자
--   재시도가 PG 호출 없이 끝나도록 한다. sweep cron 은 'pending' 과 'pg_checking' 을
--   동일하게 재시도해 PG 회복 시 자동 정렬한다.
--
-- 멱등성:
--   기존 마이그레이션에서 status CHECK 제약은 단일 source 라 새 enum 값을 추가하려면
--   제약 자체를 drop 후 재정의해야 한다. 'pg_checking' 외의 4개 값은 동일.

alter table public.billing_key_issue_intents
  drop constraint if exists billing_key_issue_intents_status_check;

alter table public.billing_key_issue_intents
  add constraint billing_key_issue_intents_status_check
    check (status in (
      'pending',
      'pg_checking',
      'completed',
      'completed_with_warning',
      'failed'
    ));

-- sweep cron 이 pg_checking row 를 빠르게 조회하기 위한 partial index.
-- 24h 이상 stuck 알람도 같은 인덱스를 활용한다.
-- completed_at 기준으로 정렬해 가장 오래 stuck 된 row 부터 처리한다 (pg_checking 진입
-- 시점에 issue 라우트가 completed_at 을 갱신하므로 이 컬럼이 "마지막 전이 시각" 역할).
create index if not exists billing_key_issue_intents_pg_checking_idx
  on public.billing_key_issue_intents(completed_at)
  where status = 'pg_checking';
