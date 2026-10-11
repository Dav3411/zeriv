-- Pro 플랜 티어 컬럼 추가 (1~4, 기본값 1)
-- Pro T1/T2/T3/T4 이미지 한도를 구독 레코드에 기록하기 위함.
-- 다른 플랜은 이 컬럼을 1로 유지.

alter table subscriptions
  add column if not exists plan_tier int not null default 1
  check (plan_tier between 1 and 4);

-- Pro 플랜 조회 최적화 인덱스
create index if not exists subscriptions_plan_tier_idx
  on subscriptions(plan, plan_tier) where plan = 'pro';
