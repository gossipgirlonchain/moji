-- Creator memes. Apply after schema.sql (and drops.sql).
-- meme_url: the picture the creator uploaded for this moji (Supabase Storage bucket moji-images, <network>/memes/<id>.webp|gif).
-- When set, image_url points at the same file so the on-chain tokenURI shows the meme; when cleared,
-- image_url goes back to the rendered emoji circle. Uploads and takedowns go through POST/DELETE /api/mojis/[combo]/meme.
alter table public.mojis add column if not exists image_url text;
alter table public.mojis add column if not exists meme_url text;

-- A meme can carry words and links. Set with the meme (launch step 4 or the moji page) through
-- PATCH /api/mojis/[combo]/meme; shown under the hero on the moji page. Same creator-only auth as the picture.
alter table public.mojis add column if not exists description text;
alter table public.mojis add column if not exists x_url text;
alter table public.mojis add column if not exists telegram_url text;
alter table public.mojis add column if not exists website_url text;

-- Memes: traditional memecoin launches (title + ticker, no emoji) share the table. kind = 'meme', name is the
-- title, symbol the ticker; display is `$PEPE` and combo (the claim key) `$pepe`, so the claims index keeps a
-- ticker unique the way it keeps an emoji combo unique. See src/lib/meme-coin.ts.
alter table public.mojis add column if not exists kind text not null default 'moji';
alter table public.mojis add column if not exists name text;
alter table public.mojis add column if not exists symbol text;
create index if not exists mojis_kind_idx on public.mojis (kind);

-- Who earns the creator's 70% fee share when the creator pointed it at someone else at launch (an X user's
-- wallet, any address). Null means the creator. The chain is the source of truth (launch-verify.ts checks the
-- pool's beneficiaries); this column just lets the site say so.
alter table public.mojis add column if not exists fee_recipient text;
