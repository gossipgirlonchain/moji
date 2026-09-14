-- Creator pipeline for /creators (admin only). Rows come from the Ratio creator application form and manual adds.
-- Server-only: RLS is on with no public policies, so only the service role key can read or write.

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- where the row came from
  source text not null default 'manual' check (source in ('ratio', 'manual')),
  source_id text unique,                  -- ratio creator_applications.id
  applied_at timestamptz,

  -- profile (as submitted)
  name text not null,
  x_handle text not null,                 -- bare handle, no @
  telegram_handle text,                   -- bare handle, no @
  telegram_channel text,
  followers text,                         -- band, e.g. '5K–15K'
  avg_views_30d text,                     -- band
  audience text[] not null default '{}',
  best_posts text[] not null default '{}',
  rates jsonb not null default '{}'::jsonb,
  sol_wallet text,
  evm_wallet text,
  application_notes text,

  -- pipeline
  stage text not null default 'new' check (stage in ('new', 'reached_out', 'replied', 'negotiating', 'agreed', 'posted', 'paid', 'declined', 'no_response')),
  priority smallint not null default 0 check (priority between 0 and 3), -- 0 none, 1 low, 2 medium, 3 high
  starred boolean not null default false,
  owner text,                             -- teammate handling this creator
  tags text[] not null default '{}',
  deal_usd numeric,
  reached_out_at timestamptz,
  replied_at timestamptz,
  agreed_at timestamptz,
  posted_at timestamptz,
  paid_at timestamptz,
  next_follow_up_at timestamptz,
  notes text
);
create unique index if not exists creators_x_handle_key on public.creators (lower(x_handle));
create index if not exists creators_stage_idx on public.creators (stage);
create index if not exists creators_priority_idx on public.creators (priority desc, updated_at desc);
create index if not exists creators_follow_up_idx on public.creators (next_follow_up_at) where next_follow_up_at is not null;

-- Activity log per creator: DMs, replies, notes, stage changes.
create table if not exists public.creator_events (
  id bigint generated always as identity primary key,
  creator_id uuid not null references public.creators(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('note', 'dm_x', 'dm_telegram', 'reply', 'call', 'stage', 'deal', 'post', 'payment')),
  body text,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists creator_events_creator_idx on public.creator_events (creator_id, created_at desc);

create or replace function public.creators_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists creators_touch on public.creators;
create trigger creators_touch before update on public.creators for each row execute function public.creators_touch();

alter table public.creators enable row level security;
alter table public.creator_events enable row level security;
