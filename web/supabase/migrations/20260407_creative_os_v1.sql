-- Ad Creative OS — Phase 1 (Image MVP)
-- 2026-04-07
-- 신규 테이블 4개 + 기존 테이블 컬럼 추가

-- ────────────────────────────────────────────────
-- 1. creative_feature_vectors
-- ────────────────────────────────────────────────
create table if not exists creative_feature_vectors (
  id                  uuid primary key default gen_random_uuid(),
  asset_id            uuid not null references generated_assets(id) on delete cascade,
  brand_id            uuid not null references brands(id) on delete cascade,
  user_id             uuid not null references auth.users(id),
  -- 이미지 feature 컬럼
  render_kind         text,    -- "render_grok"|"render_product"|"outfit"|"render_object"
  model_presence      text,    -- "none"|"partial"|"featured"|"dominant"
  product_visibility  text,    -- "none"|"background"|"featured"|"dominant"
  framing             text,    -- "close_up"|"medium"|"full_body"|"overhead"|"unknown"
  background_type     text,    -- "studio_clean"|"outdoor"|"minimal"|"clinical"|"abstract"|"unknown"
  lighting_type       text,    -- "natural_light"|"studio_clean"|"dramatic"|"warm_golden"|"dark_moody"|"unknown"
  color_temperature   text,    -- "warm"|"cool"|"neutral"|"unknown"
  tone                text,    -- "natural"|"editorial"|"playful"|"premium"|"clinical"|"unknown"
  preset_code         text,    -- 추천에서 선택한 preset (없으면 null)
  from_recommendation boolean default false,
  style_vibe          text,    -- persona.style_vibe
  pose                text,    -- "c1"|"c2"|"c3"|"custom"
  -- Phase 2 이후 추가될 숏폼 feature (미리 컬럼 확보)
  hook_type           text,
  copy_length         text,
  cta_type            text,
  scene_order         text,
  -- 확장
  extra               jsonb default '{}'::jsonb,
  extraction_source   text not null default 'auto',  -- "auto"|"manual"
  asset_type          text not null default 'image', -- "image"|"video"
  created_at          timestamptz default now()
);

create index if not exists cfv_brand_id_idx    on creative_feature_vectors(brand_id);
create index if not exists cfv_preset_code_idx on creative_feature_vectors(preset_code);
create index if not exists cfv_asset_type_idx  on creative_feature_vectors(asset_type);
create index if not exists cfv_created_at_idx  on creative_feature_vectors(created_at desc);

-- RLS
alter table creative_feature_vectors enable row level security;

create policy "Users can view own brand feature vectors"
  on creative_feature_vectors for select
  using (auth.uid() = user_id);

create policy "Users can insert own brand feature vectors"
  on creative_feature_vectors for insert
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 2. asset_performance
-- ────────────────────────────────────────────────
create table if not exists asset_performance (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references generated_assets(id) on delete cascade,
  brand_id        uuid not null references brands(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  asset_type      text not null default 'image',   -- "image"|"video"
  channel         text,                             -- "feed"|"story"|"reels"|"tiktok"
  objective       text,                             -- "awareness"|"engagement"|"conversion"|"retention"
  -- 성과 지표
  impressions     integer default 0,
  clicks          integer default 0,
  conversions     integer default 0,
  spend_krw       integer default 0,
  ctr             numeric(6,4),
  cvr             numeric(6,4),
  cpc_krw         integer,
  -- Freshness/Fatigue 계산용
  last_served_at  timestamptz,
  served_count    integer default 0,
  -- preset 참조 (feature vector에서 복사)
  preset_code     text,
  -- 메타
  source          text default 'manual',            -- "manual"|"api_import"
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create unique index if not exists ap_asset_channel_idx on asset_performance(asset_id, channel);
create index if not exists ap_brand_id_idx             on asset_performance(brand_id);
create index if not exists ap_brand_preset_idx         on asset_performance(brand_id, preset_code);
create index if not exists ap_brand_channel_idx        on asset_performance(brand_id, channel);

-- RLS
alter table asset_performance enable row level security;

create policy "Users can view own asset performance"
  on asset_performance for select
  using (auth.uid() = user_id);

create policy "Users can insert own asset performance"
  on asset_performance for insert
  with check (auth.uid() = user_id);

create policy "Users can update own asset performance"
  on asset_performance for update
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 3. feature_performance_stats
-- ────────────────────────────────────────────────
create table if not exists feature_performance_stats (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid references brands(id) on delete cascade,  -- null = global prior
  channel           text,
  objective         text,
  asset_type        text not null default 'image',  -- "image"|"video"
  feature_key       text not null,                  -- e.g. "background_type"
  feature_value     text not null,                  -- e.g. "outdoor"
  asset_count       integer default 0,
  total_impressions integer default 0,
  total_clicks      integer default 0,
  total_conversions integer default 0,
  avg_ctr           numeric(6,4),
  avg_cvr           numeric(6,4),
  avg_rating        numeric(3,2),
  confidence        numeric(4,3) default 0,
  last_computed_at  timestamptz default now(),
  created_at        timestamptz default now()
);

create unique index if not exists fps_unique_idx
  on feature_performance_stats(brand_id, channel, objective, asset_type, feature_key, feature_value)
  nulls not distinct;

create index if not exists fps_brand_id_idx    on feature_performance_stats(brand_id);
create index if not exists fps_feature_key_idx on feature_performance_stats(feature_key, feature_value);

-- RLS (global priors are readable by all authenticated users)
alter table feature_performance_stats enable row level security;

create policy "Authenticated users can read feature stats"
  on feature_performance_stats for select
  using (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────
-- 4. selection_log
-- ────────────────────────────────────────────────
create table if not exists selection_log (
  id                      uuid primary key default gen_random_uuid(),
  brand_id                uuid not null references brands(id) on delete cascade,
  user_id                 uuid not null references auth.users(id),
  selection_type          text not null default 'image',  -- "image"|"shortform"
  channel                 text,
  objective               text,
  request_params          jsonb default '{}'::jsonb,
  recommendations         jsonb not null,                  -- 추천 결과 스냅샷
  selected_preset_code    text,          -- 선택한 preset (image)
  selected_template_code  text,          -- 선택한 template (shortform, Phase 2)
  approved                boolean,
  approval_note           text,
  generated_asset_id      uuid references generated_assets(id),
  created_at              timestamptz default now(),
  decided_at              timestamptz
);

create index if not exists sl_brand_id_idx   on selection_log(brand_id);
create index if not exists sl_created_at_idx on selection_log(created_at desc);
create index if not exists sl_user_id_idx    on selection_log(user_id);

-- RLS
alter table selection_log enable row level security;

create policy "Users can view own selection logs"
  on selection_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own selection logs"
  on selection_log for insert
  with check (auth.uid() = user_id);

create policy "Users can update own selection logs"
  on selection_log for update
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 5. 기존 테이블 컬럼 추가
-- ────────────────────────────────────────────────

-- generated_assets에 feature_vector 연결
alter table generated_assets
  add column if not exists feature_vector_id uuid references creative_feature_vectors(id);

-- jobs에 selection_log 연결 (추천 기반 렌더 추적)
alter table jobs
  add column if not exists selection_log_id uuid references selection_log(id);
