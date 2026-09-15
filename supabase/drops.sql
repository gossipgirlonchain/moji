-- Creator drops: a creator sends a set amount of the moji token or the paired stock token to the top
-- holders, by hand, as plain ERC-20 transfers from their own wallet. Rules (top N, hold days, minimum
-- holding, split, floor) are signed by the creator; the server ranks holders and records each transfer
-- from its receipt. No escrow, no schedule: every drop is a one-off.
-- Apply after schema.sql. RLS on; public select where the public card reads it; writes via service role.

-- Per-moji holder bookkeeping (rebuilt from Transfer logs by /api/cron/drops)
alter table public.mojis add column if not exists holders_scanned_block bigint;
alter table public.mojis add column if not exists holders_scanned_at timestamptz;
alter table public.mojis add column if not exists holders_count integer default 0;
alter table public.mojis add column if not exists drops_active boolean not null default false; -- dropped to holders in the last 14 days
alter table public.mojis add column if not exists drops_last_at timestamptz;
alter table public.mojis add column if not exists drops_paid_usd numeric default 0;
create index if not exists mojis_drops_active_idx on public.mojis (drops_active) where drops_active;

-- Every ERC-20 Transfer of a moji token, so holding time and minimum-over-window balances can be
-- recomputed for any window without trusting an indexer.
create table if not exists public.token_transfers (
  moji_id uuid not null references public.mojis(id) on delete cascade,
  block bigint not null,
  log_index integer not null,
  ts timestamptz not null,
  from_address text not null,
  to_address text not null,
  value numeric not null,           -- wei
  primary key (moji_id, block, log_index)
);
create index if not exists token_transfers_moji_ts_idx on public.token_transfers (moji_id, ts);

-- Block timestamps, cached per chain so the scan does not refetch them.
create table if not exists public.block_times (
  chain_id integer not null,
  block bigint not null,
  ts timestamptz not null,
  primary key (chain_id, block)
);

-- Current balance per holder, maintained by the same scan.
create table if not exists public.holder_balances (
  moji_id uuid not null references public.mojis(id) on delete cascade,
  address text not null,
  balance numeric not null default 0,   -- wei
  first_in_at timestamptz,
  last_out_at timestamptz,
  updated_block bigint,
  primary key (moji_id, address)
);
create index if not exists holder_balances_moji_balance_idx on public.holder_balances (moji_id, balance desc);

create table if not exists public.drops (
  id uuid primary key default gen_random_uuid(),
  moji_id uuid not null references public.mojis(id) on delete cascade,
  chain_id integer not null,
  network text not null,
  creator_address text not null,
  -- what is given
  token_kind text not null check (token_kind in ('moji','stock')),
  token_address text not null,
  token_decimals integer not null default 18,
  token_symbol text not null,
  amount numeric not null,              -- to holders, whole units, what the creator typed
  amount_wei numeric not null,
  -- processing fee: one extra transfer to the treasury, on top of the amount
  fee_bps integer not null default 50,
  fee_wei numeric not null default 0,
  fee_tx text,
  -- who gets it
  top_n integer not null check (top_n > 0),
  hold_days integer not null check (hold_days >= 0),
  min_hold numeric not null default 0,  -- in moji tokens (whole units), not USD
  min_hold_wei numeric not null default 0,
  min_payout_usd numeric not null default 2,
  split text not null default 'prorata' check (split in ('prorata','equal')),
  cap_bps integer not null default 500 check (cap_bps between 0 and 10000),
  excluded text[] not null default '{}',
  -- the creator's signature over the rules
  signed_message text,
  signature text,
  -- the ranking the drop was cut on
  cut_at timestamptz not null default now(),
  eligible integer not null default 0,
  recipients integer not null default 0,
  threshold_wei numeric,               -- the smallest holding that made the top N
  token_price_usd numeric,
  -- progress: the creator sends one transfer per recipient; each is confirmed from its receipt
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  sent_count integer not null default 0,
  sent_wei numeric not null default 0,
  sent_usd numeric not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists drops_moji_idx on public.drops (moji_id, created_at desc);

create table if not exists public.drop_payouts (
  drop_id uuid not null references public.drops(id) on delete cascade,
  moji_id uuid not null references public.mojis(id) on delete cascade,
  address text not null,
  rank integer not null,
  held_wei numeric not null,           -- minimum balance held across the hold window
  amount_wei numeric not null,
  amount_usd numeric not null default 0,
  tx_hash text,
  sent_at timestamptz,
  error text,
  primary key (drop_id, address)
);
create index if not exists drop_payouts_address_idx on public.drop_payouts (address, moji_id);
create index if not exists drop_payouts_pending_idx on public.drop_payouts (drop_id) where tx_hash is null;

alter table public.token_transfers enable row level security;
alter table public.block_times enable row level security;
alter table public.holder_balances enable row level security;
alter table public.drops enable row level security;
alter table public.drop_payouts enable row level security;
-- holder_balances and token_transfers stay private (service role only). Drops and payouts are public read.
drop policy if exists "drops are public" on public.drops;
create policy "drops are public" on public.drops for select using (true);
drop policy if exists "drop_payouts are public" on public.drop_payouts;
create policy "drop_payouts are public" on public.drop_payouts for select using (true);
