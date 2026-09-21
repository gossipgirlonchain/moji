-- Wallet and agent launches (no X account). Apply after schema.sql.
-- creator_kind: "x" (Privy login with a linked X account, the app's path), "wallet" (recorded from the tx hash
-- alone), "agent" (a wallet that declared itself an autonomous agent; shown as 🤖). Existing rows are all "x".
-- POST /api/launch tolerates the column being absent (it retries the insert without it), so deploying the code
-- before this migration is safe; the kind is simply not recorded until it is applied.
alter table public.mojis add column if not exists creator_kind text not null default 'x';
alter table public.mojis drop constraint if exists mojis_creator_kind_check;
alter table public.mojis add constraint mojis_creator_kind_check check (creator_kind in ('x', 'wallet', 'agent'));
create index if not exists mojis_creator_kind_idx on public.mojis (creator_kind) where creator_kind <> 'x';
-- Wallet-path rate limit and dead-moji cap look launches up by wallet.
create index if not exists mojis_creator_address_idx on public.mojis (lower(creator_address), launched_at desc);
