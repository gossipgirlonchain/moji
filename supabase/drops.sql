-- Creator drops: campaigns that pay a locked amount of the moji token or the paired stock token to
-- top holders over a number of days, with a minimum holding time and a minimum holding amount.
-- Apply after schema.sql. RLS on; public select where the public card reads it; writes via service role.

-- Per-moji holder bookkeeping (rebuilt from Transfer logs by /api/cron/drops)
alter table public.mojis add column if not exists holders_scanned_block bigint;
alter table public.mojis add column if not exists holders_scanned_at timestamptz;
alter table public.mojis add column if not exists holders_count integer default 0;
alter table public.mojis add column if not exists drops_active boolean not null default false;
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

create table if not exists public.drop_campaigns (
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
  amount numeric not null,              -- whole units, what the creator typed
  amount_wei numeric not null,
  -- who gets it
  top_n integer not null check (top_n > 0),
  days integer not null check (days > 0),
  hold_days integer not null check (hold_days >= 0),
  min_hold numeric not null default 0,  -- in moji tokens (whole units), not USD
  min_hold_wei numeric not null default 0,
  min_payout_usd numeric not null default 2,
  split text not null default 'prorata' check (split in ('prorata','equal')),
  cap_bps integer not null default 500 check (cap_bps between 0 and 10000),
  cut_hour_utc integer not null default 9 check (cut_hour_utc between 0 and 23),
  excluded text[] not null default '{}',
  -- processing fee on payouts (bps), fixed by the escrow at funding; fees_wei is what has been charged so far
  fee_bps integer not null default 50,
  fees_wei numeric not null default 0,
  -- the creator's signature over the rules; the rules cannot change after funding
  signed_message text,
  signature text,
  -- lifecycle
  status text not null default 'draft' check (status in ('draft','running','done','ended','failed')),
  onchain_id bigint,
  fund_tx text,
  funded_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  reclaim_after timestamptz,
  next_cut_at timestamptz,
  rounds_paid integer not null default 0,
  paid_wei numeric not null default 0,
  paid_usd numeric not null default 0,
  end_tx text,
  created_at timestamptz not null default now()
);
create index if not exists drop_campaigns_moji_idx on public.drop_campaigns (moji_id, created_at desc);
create index if not exists drop_campaigns_due_idx on public.drop_campaigns (next_cut_at) where status = 'running';

create table if not exists public.drop_rounds (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.drop_campaigns(id) on delete cascade,
  moji_id uuid not null references public.mojis(id) on delete cascade,
  round_no integer not null,
  cut_at timestamptz not null,
  block bigint,
  pot_wei numeric not null,
  paid_wei numeric not null default 0,
  paid_usd numeric not null default 0,
  fee_wei numeric not null default 0,
  eligible integer not null default 0,
  recipients integer not null default 0,
  skipped integer not null default 0,
  threshold_wei numeric,               -- the smallest holding that made the top N this round
  token_price_usd numeric,
  tx_hash text,
  status text not null default 'pending' check (status in ('pending','paid','skipped','failed')),
  error text,
  unique (campaign_id, round_no)
);
create index if not exists drop_rounds_moji_idx on public.drop_rounds (moji_id, cut_at desc);

create table if not exists public.drop_payouts (
  round_id uuid not null references public.drop_rounds(id) on delete cascade,
  campaign_id uuid not null references public.drop_campaigns(id) on delete cascade,
  moji_id uuid not null references public.mojis(id) on delete cascade,
  address text not null,
  rank integer not null,
  held_wei numeric not null,           -- minimum balance held across the hold window
  amount_wei numeric not null,
  amount_usd numeric not null default 0,
  primary key (round_id, address)
);
create index if not exists drop_payouts_address_idx on public.drop_payouts (address, moji_id);

alter table public.token_transfers enable row level security;
alter table public.block_times enable row level security;
alter table public.holder_balances enable row level security;
alter table public.drop_campaigns enable row level security;
alter table public.drop_rounds enable row level security;
alter table public.drop_payouts enable row level security;
-- holder_balances and token_transfers stay private (service role only). The rest is public read.
drop policy if exists "drop_campaigns are public" on public.drop_campaigns;
create policy "drop_campaigns are public" on public.drop_campaigns for select using (true);
drop policy if exists "drop_rounds are public" on public.drop_rounds;
create policy "drop_rounds are public" on public.drop_rounds for select using (true);
drop policy if exists "drop_payouts are public" on public.drop_payouts;
create policy "drop_payouts are public" on public.drop_payouts for select using (true);
