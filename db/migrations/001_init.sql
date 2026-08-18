-- Thailand Trip Brain -- Reel Ingestion MVP
--
-- Three layers from the PRD:
--   Layer 1 (source)   -> reels + share_events
--   Layer 2 (captured) -> captured_content
--   Layer 3 (derived)  -> intentionally absent; future features add their own tables
--                         and must never write into captured_content.

create extension if not exists pgcrypto;

-- One row per unique reel.
--
-- Identity is deliberately loose because the two intake paths know different things:
-- a forwarded reel gives us only a signed CDN asset, a pasted permalink gives us a
-- shortcode. video_sha256 is the one identifier both paths eventually agree on, so it
-- is the canonical dedupe key. Postgres permits many NULLs in a unique column, so a
-- reel that only ever arrived by forward simply has no shortcode.
create table reels (
  id               uuid primary key default gen_random_uuid(),

  ig_asset_id      text unique,
  shortcode        text unique,
  video_sha256     text unique,

  permalink        text,
  creator_username text,
  caption          text,
  duration_seconds numeric(10, 3),

  video_path       text,
  thumbnail_path   text,

  status           text not null default 'pending'
                     check (status in ('pending', 'fetched', 'done', 'failed', 'unavailable', 'merged')),
  merged_into      uuid references reels (id) on delete set null,

  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,

  intake_source    text not null check (intake_source in ('webhook', 'paste', 'upload')),
  -- Signed CDN link or pasted permalink. Signed links expire, so this is a lead, not a guarantee.
  intake_ref       text,
  raw_intake       jsonb not null default '{}'::jsonb,

  first_seen_at    timestamptz not null default now(),
  fetched_at       timestamptz,
  processed_at     timestamptz
);

-- Drives job claiming for both the fetch and extract stages.
create index reels_claim_idx on reels (status, next_attempt_at);
create index reels_recent_idx on reels (first_seen_at desc);

-- One row per share. This is what preserves "who shared it and when", and what keeps
-- the same reel being shared by three different people from collapsing into one fact.
create table share_events (
  id            uuid primary key default gen_random_uuid(),
  reel_id       uuid not null references reels (id) on delete cascade,

  -- Meta delivers webhooks at least once and may reorder them, so this is the
  -- idempotency key for replays.
  ig_message_id text unique,

  -- Nullable on purpose. A forwarded reel carries no provenance, so this is filled in
  -- later from the dashboard if and when the owner cares.
  shared_by     text,
  shared_at     timestamptz not null default now(),
  source        text not null check (source in ('webhook', 'paste', 'upload')),
  raw_item      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index share_events_reel_idx on share_events (reel_id);
create index share_events_recent_idx on share_events (shared_at desc);

-- Layer 2. Keyed by extractor_version so re-running a better model later is additive
-- rather than destructive.
create table captured_content (
  id                 uuid primary key default gen_random_uuid(),
  reel_id            uuid not null references reels (id) on delete cascade,
  extractor_version  text not null,
  model              text not null,

  language           text,
  has_speech         boolean,
  transcript         text,
  on_screen_text     text,
  visual_description text,

  places             jsonb not null default '[]'::jsonb,
  prices             jsonb not null default '[]'::jsonb,
  tips               jsonb not null default '[]'::jsonb,
  warnings           jsonb not null default '[]'::jsonb,

  raw_model_output   jsonb not null,
  created_at         timestamptz not null default now(),

  unique (reel_id, extractor_version)
);

create index captured_content_reel_idx on captured_content (reel_id);

-- Single row. Lets the dashboard distinguish "the pipeline is healthy and the group was
-- quiet" from "the pipeline has been dead for two days".
create table system_status (
  id                  boolean primary key default true check (id),
  worker_heartbeat_at timestamptz,
  last_webhook_at     timestamptz,
  last_intake_at      timestamptz,
  last_error          text,
  updated_at          timestamptz not null default now()
);

insert into system_status (id) values (true) on conflict do nothing;
