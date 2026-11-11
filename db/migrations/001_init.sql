-- ClipForge schema. Plain PostgreSQL 14+; no vendor extensions beyond pgcrypto.
create extension if not exists pgcrypto;

-- Subscription plans and their limits. Edited from the admin panel.
create table plans (
  id                         text primary key,            -- 'free', 'pro'
  name                       text not null,
  price_cents_monthly        integer not null default 0,
  max_source_duration_sec    integer not null,            -- longest source video accepted
  max_upload_bytes           bigint  not null,            -- largest single upload / import
  monthly_processing_minutes integer not null,            -- minutes of source video processed per month
  storage_bytes              bigint  not null,            -- total stored bytes
  max_clips_per_job          integer not null,
  queue_priority             integer not null,            -- BullMQ priority: lower runs first
  allow_batch                boolean not null default false, -- ZIP / multi-select downloads
  updated_at                 timestamptz not null default now()
);

insert into plans values
  ('free', 'Free', 0,    30*60,  2147483648,  120,   5368709120, 200, 10, true,  now()),
  ('pro',  'Pro',  1200, 4*3600, 21474836480, 1200, 107374182400, 1000, 1, true, now());

create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  password_hash  text not null,
  display_name   text,
  role           text not null default 'user' check (role in ('user','admin')),
  plan_id        text not null default 'free' references plans(id),
  suspended_at   timestamptz,
  suspended_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Opaque session tokens. Only the SHA-256 hash is stored.
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  user_agent  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

-- Placeholder for a real payment provider. Nothing here takes money.
create table subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  plan_id            text not null references plans(id),
  status             text not null default 'inactive' check (status in ('inactive','active','past_due','canceled')),
  provider           text,               -- e.g. 'stripe', 'paystack' once integrated
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index subscriptions_user_idx on subscriptions(user_id);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_user_idx on projects(user_id, updated_at desc);

-- Source videos (one per project).
create table videos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  source_type   text not null check (source_type in ('upload','url')),
  source_url    text,
  original_name text,
  title         text,
  status        text not null default 'pending'
                check (status in ('pending','uploading','importing','probing','ready','failed')),
  error         text,
  storage_key   text,
  thumb_key     text,
  size_bytes    bigint,
  duration_sec  double precision,
  width         integer,
  height        integer,
  fps           double precision,
  video_codec   text,
  audio_codec   text,
  has_audio     boolean,
  container     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index videos_user_idx on videos(user_id, created_at desc);
create index videos_project_idx on videos(project_id);

-- Multipart upload sessions (resumable).
create table uploads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  video_id      uuid not null references videos(id) on delete cascade,
  storage_key   text not null,
  driver_upload_id text,          -- S3 multipart UploadId; null for local driver
  file_name     text not null,
  size_bytes    bigint not null,
  mime_type     text,
  part_size     integer not null,
  part_count    integer not null,
  status        text not null default 'active' check (status in ('active','completed','aborted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index uploads_user_idx on uploads(user_id);

-- Processing jobs. Progress is written here by the worker and polled by the UI.
create table jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  video_id         uuid not null references videos(id) on delete cascade,
  kind             text not null default 'clip' check (kind in ('clip')),
  status           text not null default 'waiting'
                   check (status in ('waiting','processing','completed','failed','canceled')),
  config           jsonb not null,           -- ClipConfig
  segments         jsonb not null,           -- planned [{start,end}]
  idempotency_key  text,
  total_clips      integer not null,
  completed_clips  integer not null default 0,
  current_clip     integer,
  progress         real not null default 0,   -- 0..1
  eta_sec          integer,
  error            text,
  attempts         integer not null default 0,
  cancel_requested boolean not null default false,
  source_seconds   double precision not null default 0,  -- billed processing seconds
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index jobs_user_idx on jobs(user_id, created_at desc);
create index jobs_status_idx on jobs(status);
create index jobs_project_idx on jobs(project_id);

create table clips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  idx           integer not null,         -- 1-based clip number
  start_sec     double precision not null,
  end_sec       double precision not null,
  duration_sec  double precision not null,
  storage_key   text not null,
  thumb_key     text,
  size_bytes    bigint not null default 0,
  format        text not null,
  width         integer,
  height        integer,
  method        text not null,            -- 'copy' or 'encode'
  saved         boolean not null default false,
  share_token   text unique,
  created_at    timestamptz not null default now(),
  unique (job_id, idx)
);
create index clips_user_idx on clips(user_id);
create index clips_project_idx on clips(project_id, idx);

-- ZIP exports, built by the worker.
create table exports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  clip_ids     uuid[] not null,
  status       text not null default 'waiting' check (status in ('waiting','processing','completed','failed')),
  progress     real not null default 0,
  storage_key  text,
  size_bytes   bigint,
  error        text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index exports_user_idx on exports(user_id);

-- Monthly processing usage per user.
create table usage_monthly (
  user_id            uuid not null references users(id) on delete cascade,
  month              date not null,     -- first day of month
  processing_seconds double precision not null default 0,
  primary key (user_id, month)
);

-- Errors captured from the worker and API for the admin panel.
create table system_errors (
  id         bigserial primary key,
  source     text not null,         -- 'worker', 'api'
  context    text,
  message    text not null,
  details    jsonb,
  user_id    uuid references users(id) on delete set null,
  job_id     uuid,
  created_at timestamptz not null default now()
);
create index system_errors_created_idx on system_errors(created_at desc);

