import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { verifyPrivyToken, PRIVY_SERVER_CONFIGURED } from "@/lib/privy-server";
import { isAdmin } from "@/lib/admin";
import { MEME_MAX_BYTES, processMeme, removeMeme, storeMeme } from "@/lib/memes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The creator's meme for a moji.
 *   POST   /api/mojis/[combo]/meme?chain=&pair=   multipart `file` (png, jpg, gif, webp, ≤ 4 MB) → { meme_url }
 *   DELETE /api/mojis/[combo]/meme?chain=&pair=   takedown → { ok }
 * Creator only (Privy DID must match mojis.creator_did), or the admin cookie for takedowns and fixes.
 * The picture is normalized server-side (src/lib/memes.ts), stored in the moji-images bucket and mirrored into
 * image_url so the on-chain tokenURI, the OG card and every tile show the same file.
 */
async function resolve(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: NextResponse.json({ error: "Supabase service role key not configured" }, { status: 500 }) };
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };

  const admin = await isAdmin();
  if (!admin) {
    if (!PRIVY_SERVER_CONFIGURED) return { error: NextResponse.json({ error: "Privy app secret not configured; memes need a verified creator" }, { status: 500 }) };
    const verified = await verifyPrivyToken(req.headers.get("authorization"));
    if (!verified || verified === "unconfigured") return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
    if (!m.creator_did || m.creator_did !== verified.did) return { error: NextResponse.json({ error: "Only the creator can change this moji's meme" }, { status: 403 }) };
  }
  return { m };
}

function pagePath(m: MojiRow) {
  const base = `/m/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}`;
  return m.chain_id !== 4663 ? `${base}/${m.chain_id}` : base;
}

function revalidate(m: MojiRow) {
  for (const p of [pagePath(m), `/m/${encodeURIComponent(m.display)}`, "/", "/explore", "/leaderboard", "/me"]) revalidatePath(p);
}

export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const r = await resolve(req, ctx);
  if ("error" in r) return r.error;
  const m = r.m;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Send the picture as multipart form data under `file`" }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ error: "No picture attached" }, { status: 400 });
  if (file.size > MEME_MAX_BYTES) return NextResponse.json({ error: "Pictures are capped at 4 MB" }, { status: 413 });

  let processed;
  try {
    processed = await processMeme(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that picture" }, { status: 415 });
  }

  try {
    const url = await storeMeme(m, processed);
    const { error } = await supabaseServer().from("mojis").update({ meme_url: url, image_url: url }).eq("id", m.id);
    if (error) throw error;
    revalidate(m);
    return NextResponse.json({ meme_url: url, width: processed.width, height: processed.height, animated: processed.animated });
  } catch (e) {
    console.error("meme store failed", e);
    return NextResponse.json({ error: "Could not store the picture, try again" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const r = await resolve(req, ctx);
  if ("error" in r) return r.error;
  const m = r.m;
  try {
    const rendered = await removeMeme(m);
    const { error } = await supabaseServer().from("mojis").update({ meme_url: null, image_url: rendered }).eq("id", m.id);
    if (error) throw error;
    revalidate(m);
    return NextResponse.json({ ok: true, image_url: rendered });
  } catch (e) {
    console.error("meme remove failed", e);
    return NextResponse.json({ error: "Could not remove the picture" }, { status: 500 });
  }
}
