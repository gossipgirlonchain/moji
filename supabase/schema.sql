-- Moji: claims registry + moji metadata
-- Combos are stored normalized (variation selectors + skin tones stripped).

create table if not exists public.claims (
  combo text primary key,                 -- normalized combo, globally unique forever
  display text not null,                  -- combo as the creator typed it
  chain_id integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists claims_combo_unique on public.claims (combo);

create table if not exists public.mojis (
  id uuid primary key default gen_random_uuid(),
  combo text not null unique references public.claims(combo) on delete restrict,
  display text not null,
  chain_id integer not null,
  stock_ticker text not null,
  stock_address text not null,
  token_address text,
  pool_id text,
  tx_hash text,
  supply numeric,
  market_cap_usd numeric default 0,
  fees_claimed_usd numeric default 0,
  fees_unclaimed_usd numeric default 0,
  creator_did text,
  creator_handle text,
  creator_address text,
  launched_at timestamptz not null default now()
);
create index if not exists mojis_launched_at_idx on public.mojis (launched_at desc);
create index if not exists mojis_market_cap_idx on public.mojis (market_cap_usd desc);
create index if not exists mojis_fees_idx on public.mojis ((coalesce(fees_claimed_usd,0) + coalesce(fees_unclaimed_usd,0)) desc);

-- Public read, server-only write (service role bypasses RLS).
alter table public.claims enable row level security;
alter table public.mojis enable row level security;
drop policy if exists "claims are public" on public.claims;
create policy "claims are public" on public.claims for select using (true);
drop policy if exists "mojis are public" on public.mojis;
create policy "mojis are public" on public.mojis for select using (true);

-- Global counter helper
create or replace function public.claims_count()
returns bigint language sql stable as $$ select count(*) from public.claims $$;

-- Creator memes (supabase/memes.sql)
alter table public.mojis add column if not exists image_url text;
alter table public.mojis add column if not exists meme_url text;

-- MEME launches (supabase/memecoins.sql)
alter table public.mojis add column if not exists kind text not null default 'moji';
alter table public.mojis add column if not exists name text;
alter table public.mojis add column if not exists symbol text;
alter table public.mojis add constraint mojis_kind_check check (kind in ('moji', 'meme'));
