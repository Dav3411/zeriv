-- 사용자 행동 신호 테이블
-- 이미지 단위로 다운로드/피드백/재사용 등을 누적 기록
-- 추후 Bayesian Updater에서 스타일별 성과 추정에 사용

create table if not exists creative_signals (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references assets(id) on delete cascade,
  brand_id        uuid references brands(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  signal_type     text not null check (signal_type in (
    'download',
    'feedback_positive',
    'feedback_negative',
    'style_reuse',
    'variation_request'
  )),
  weight          numeric not null default 1.0,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists creative_signals_asset_idx
  on creative_signals(asset_id);
create index if not exists creative_signals_org_time_idx
  on creative_signals(organization_id, created_at desc);
create index if not exists creative_signals_brand_type_idx
  on creative_signals(brand_id, signal_type);

-- 같은 사용자가 같은 asset에 같은 피드백 중복 입력 방지 (positive/negative만)
create unique index if not exists creative_signals_unique_feedback
  on creative_signals(asset_id, user_id, signal_type)
  where signal_type in ('feedback_positive', 'feedback_negative');
