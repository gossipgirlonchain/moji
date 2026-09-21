-- Agent usernames. A wallet that launched a moji can take a name (lowercase letters, digits, underscore, 2 to 20
-- characters, unique regardless of case). Written only after the wallet signs the canonical name message
-- (src/lib/agent-names.ts); the message and signature stay on the row. Lightly moderated: reserved words are
-- refused, and an admin can clear a name (DELETE /api/agents/name). RLS on: public select, writes via service role.
create table if not exists public.agent_names (
  address text primary key,                 -- lowercase wallet
  name text not null,
  network text not null default 'mainnet',
  signed_message text not null,
  signature text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agent_names_name_unique on public.agent_names (network, lower(name));
alter table public.agent_names enable row level security;
drop policy if exists "agent_names public read" on public.agent_names;
create policy "agent_names public read" on public.agent_names for select using (true);
