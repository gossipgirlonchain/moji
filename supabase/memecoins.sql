-- MEME launches (traditional memecoins: name, ticker, picture) share the mojis table with mojis.
-- kind: 'moji' (emoji combo, the default) or 'meme'. name/symbol are set for memes only; combo holds
-- the synthetic key meme:<chainId>:<numeraire>:<SYMBOL> (src/lib/memecoin.ts) so the claims index keeps
-- one ticker per pair per chain, and display holds "$SYMBOL". Apply after memes.sql.
alter table public.mojis add column if not exists kind text not null default 'moji';
alter table public.mojis add column if not exists name text;
alter table public.mojis add column if not exists symbol text;
alter table public.mojis drop constraint if exists mojis_kind_check;
alter table public.mojis add constraint mojis_kind_check check (kind in ('moji', 'meme'));
create index if not exists mojis_kind_idx on public.mojis (kind);
