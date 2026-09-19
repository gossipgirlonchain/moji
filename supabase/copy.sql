-- Delegated wallets and copied trades. Apply after follows.sql.
-- delegations: a user's Privy embedded wallet that the moji signer may send from (the user added the signer on
-- /profile, then POST /api/me/delegate recorded the wallet id). The copy engine re-checks `delegated` with Privy
-- before every send. copy_trades: one row per (follow, source swap); the unique index is what stops a double send.
create table if not exists public.delegations (
  address text primary key,                 -- lowercase embedded wallet address
  did text not null,                        -- Privy user id
  wallet_id text not null,                  -- Privy server wallet id
  network text not null default 'mainnet',
  created_at timestamptz not null default now()
);
alter table public.delegations enable row level security;

create table if not exists public.copy_trades (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'mainnet',
  follow_id uuid not null references public.follows(id) on delete cascade,
  follower text not null,
  followee text not null,
  moji_id uuid not null references public.mojis(id) on delete cascade,
  source_tx text not null,                  -- the agent's swap we copied
  side text not null check (side in ('buy', 'sell')),
  usd numeric not null default 0,           -- what we set out to spend (buy) or the value sold (sell)
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  tx_hash text,
  reason text,
  created_at timestamptz not null default now(),
  unique (follow_id, source_tx)
);
create index if not exists copy_trades_follow_day_idx on public.copy_trades (follow_id, created_at desc);
alter table public.copy_trades enable row level security;
drop policy if exists "copy_trades public read" on public.copy_trades;
create policy "copy_trades public read" on public.copy_trades for select using (true);
