-- Creator memes. Apply after schema.sql (and drops.sql).
-- meme_url: the picture the creator uploaded for this moji (Supabase Storage bucket moji-images, <network>/memes/<id>.webp|gif).
-- When set, image_url points at the same file so the on-chain tokenURI shows the meme; when cleared,
-- image_url goes back to the rendered emoji circle. Uploads and takedowns go through POST/DELETE /api/mojis/[combo]/meme.
alter table public.mojis add column if not exists image_url text;
alter table public.mojis add column if not exists meme_url text;
