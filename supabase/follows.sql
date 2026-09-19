-- Follows: a wallet follows an agent (a wallet that launched a moji) and may set copy rules on the follow.
-- Rows are written only after the follower signs the canonical follow message (personal_sign, see
-- src/lib/follows.ts); the message and signature are kept on the row. The copy engine (not built yet) reads
-- `copy` and the limits. Apply after schema.sql. RLS on: public select, writes via the service role.
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'mainnet',
  follower text not null,                          -- lowercase wallet
  followee text not null,                          -- lowercase wallet of a launcher
  copy boolean not null default false,             -- copy this agent's buys and sells
  max_per_trade_usd numeric not null default 0,    -- per copied trade
  max_per_day_usd numeric not null default 0,      -- across all copied trades from this agent, per UTC day
  pairs text[],                                    -- only mojis paired to these tickers; null = any
  min_holders integer not null default 0,          -- only mojis with at least this many holders
  signed_message text not null,
  signature text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, follower, followee)
);
create index if not exists follows_followee_idx on public.follows (network, followee);
create index if not exists follows_follower_idx on public.follows (network, follower);
alter table public.follows enable row level security;
drop policy if exists "follows public read" on public.follows;
create policy "follows public read" on public.follows for select using (true);
