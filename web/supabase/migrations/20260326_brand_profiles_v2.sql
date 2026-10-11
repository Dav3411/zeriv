-- ─── Brand Profiles v2 ────────────────────────────────────────────────────────
-- Adds: feedback_events, generation_sessions, generated_assets

-- feedback_events
create table if not exists feedback_events (
  id                uuid primary key default gen_random_uuid(),
  brand_profile_id  uuid not null references brand_profiles(id) on delete cascade,
  user_id           uuid not null,
  type              text not null check (type in ('preset', 'slider', 'manual', 're_analyze')),
  delta             jsonb not null default '{}'::jsonb,
  result_profile_id uuid references brand_profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists feedback_events_brand_profile_id_idx on feedback_events(brand_profile_id);
create index if not exists feedback_events_user_id_idx on feedback_events(user_id);

-- generation_sessions
create table if not exists generation_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  target_type      text not null check (target_type in ('brand_profile', 'brand_concept')),
  target_id        uuid not null,
  mode             text not null check (mode in ('image', 'video', 'shortform')),
  status           text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  profile_snapshot jsonb not null default '{}'::jsonb,
  prompt_override  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists generation_sessions_user_id_idx on generation_sessions(user_id);
create index if not exists generation_sessions_target_idx  on generation_sessions(target_type, target_id);

-- generated_assets
create table if not exists generated_assets (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references generation_sessions(id) on delete cascade,
  asset_type        text not null check (asset_type in ('image', 'video')),
  public_url        text not null,
  generation_params jsonb not null default '{}'::jsonb,
  rating            smallint check (rating between 1 and 5),
  created_at        timestamptz not null default now()
);

create index if not exists generated_assets_session_id_idx on generated_assets(session_id);

-- RLS
alter table feedback_events     enable row level security;
alter table generation_sessions enable row level security;
alter table generated_assets    enable row level security;

create policy "Users manage own feedback_events"
  on feedback_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own generation_sessions"
  on generation_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users view own generated_assets via session"
  on generated_assets for all
  using (
    exists (
      select 1 from generation_sessions s
      where s.id = generated_assets.session_id
        and s.user_id = auth.uid()
    )
  );
