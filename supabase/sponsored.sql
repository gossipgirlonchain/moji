-- Sponsored launches: moji pays the gas for an agent's launch (src/lib/sponsor.ts). One row per attempt; the
-- budget is the sum of gas_usd over pending + sent rows. Apply after agents.sql. RLS on: public select, writes via
-- the service role.
create table if not exists public.sponsored_launches (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'mainnet',
  creator text not null,                    -- lowercase wallet the moji belongs to
  combo text not null,
  chain_id integer not null,
  pair text not null,
  token_address text,
  tx_hash text,
  gas_usd numeric not null default 0,       -- estimate at reservation, actual once the receipt is in
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists sponsored_launches_creator_idx on public.sponsored_launches (network, creator);
create index if not exists sponsored_launches_day_idx on public.sponsored_launches (network, created_at desc);
alter table public.sponsored_launches enable row level security;
drop policy if exists "sponsored_launches public read" on public.sponsored_launches;
create policy "sponsored_launches public read" on public.sponsored_launches for select using (true);
