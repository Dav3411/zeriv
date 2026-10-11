-- ─── Taste Engine Tables ─────────────────────────────────────────────────────
-- Sprint 1: brand_style_preferences + taste_learning_events

-- ── brand_style_preferences ───────────────────────────────────────────────────
-- 브랜드별 누적 선호 벡터. feature_key 단위로 학습된 방향과 강도를 저장.

create table if not exists brand_style_preferences (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null,
  user_id               uuid not null,

  -- 'base': 브랜드 전체 적용, 'concept': 특정 concept에만 적용
  profile_scope         text not null default 'base'
                          check (profile_scope in ('base', 'concept')),
  concept_id            uuid references brand_concepts(id) on delete set null,

  -- 점(dot) 경로 형식: "color_system.base_temperature"
  feature_key           text not null,

  -- 열거형 feature의 경우 선호하는 구체적 값 (예: "warm")
  preferred_value       text,

  -- 학습된 방향 벡터: -1.0(최대 억제) ~ 0(중립) ~ +1.0(최대 강화)
  current_weight        float not null default 0.0,

  -- 신호 누적량 기반 신뢰도: 0.0 ~ 1.0
  confidence            float not null default 0.0,

  positive_signal_count int not null default 0,
  negative_signal_count int not null default 0,
  last_signal_at        timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- 브랜드+유저+스코프+컨셉+feature 조합은 유일
  unique (brand_id, user_id, profile_scope, feature_key)
);

create index if not exists bsp_brand_user_idx    on brand_style_preferences(brand_id, user_id);
create index if not exists bsp_brand_feature_idx on brand_style_preferences(brand_id, feature_key);
create index if not exists bsp_concept_idx       on brand_style_preferences(concept_id) where concept_id is not null;

-- ── taste_learning_events ─────────────────────────────────────────────────────
-- 취향 벡터를 변경한 모든 이벤트의 audit log.

create table if not exists taste_learning_events (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null,
  user_id               uuid not null,

  -- 이벤트 원인 추적 (null 가능)
  generation_session_id uuid references generation_sessions(id) on delete set null,
  asset_id              uuid references generated_assets(id)    on delete set null,
  feedback_event_id     uuid references feedback_events(id)     on delete set null,

  source_type           text not null
                          check (source_type in ('rating', 'preset', 'slider', 'manual')),

  feature_key           text not null,
  delta_value           float not null,   -- 이번 신호로 가해진 실제 변화량
  old_weight            float not null,
  new_weight            float not null,

  -- 사람이 읽을 수 있는 변화 이유
  reason                text,

  created_at            timestamptz not null default now()
);

create index if not exists tle_brand_user_idx   on taste_learning_events(brand_id, user_id);
create index if not exists tle_asset_idx        on taste_learning_events(asset_id) where asset_id is not null;
create index if not exists tle_session_idx      on taste_learning_events(generation_session_id) where generation_session_id is not null;
create index if not exists tle_created_at_idx   on taste_learning_events(brand_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table brand_style_preferences enable row level security;
alter table taste_learning_events    enable row level security;

create policy "Users manage own brand_style_preferences"
  on brand_style_preferences for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own taste_learning_events"
  on taste_learning_events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
