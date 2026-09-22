import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { verifyPrivyToken, PRIVY_SERVER_CONFIGURED } from "@/lib/privy-server";
import { isAdmin } from "@/lib/admin";
import { MEME_MAX_BYTES, processMeme, removeMeme, storeMeme } from "@/lib/memes";
import { createHash } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";
import { memeDetailsMessage, memeRemoveMessage, memeSetMessage, MEME_SIGNATURE_TTL_MS } from "@/lib/meme-auth";
import { cleanMemeDetails } from "@/lib/meme-details";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The creator's meme for a moji.
 *   POST   /api/mojis/[combo]/meme?chain=&pair=   multipart `file` (png, jpg, gif, webp, ≤ 4 MB) → { meme_url }
 *   PATCH  /api/mojis/[combo]/meme?chain=&pair=   json { details: "<json>" } → { details }; the words and links
 *          (description ≤ 280 chars, x_url, telegram_url, website_url; empty string clears a field)
 *   DELETE /api/mojis/[combo]/meme?chain=&pair=   takedown → { ok }
 * Creator only, or the admin cookie for takedowns and fixes. Two creator identities, matching the launch paths:
 *   - app launches: a Privy access token whose DID matches mojis.creator_did
 *   - wallet and agent launches (no DID): `signer` + `signature` from creator_address over the message in
 *     src/lib/meme-auth.ts (POST binds the file's sha256, PATCH the details string's sha256, DELETE a fresh timestamp),
 *     so nothing replays.
 * The picture is normalized server-side (src/lib/memes.ts), stored in the moji-images bucket and mirrored into
 * image_url so the on-chain tokenURI, the OG card and every tile show the same file.
 */
type Auth = { kind: "admin" } | { kind: "did"; did: string } | { kind: "wallet"; signer: Address; signature: Hex };

async function resolve(req: Request, ctx: { params: Promise<{ combo: string }> }, sig: { signer?: string | null; signature?: string | null }) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: NextResponse.json({ error: "Supabase service role key not configured" }, { status: 500 }) };
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };

  if (await isAdmin()) return { m, auth: { kind: "admin" } as Auth };

  const bearer = req.headers.get("authorization");
  if (bearer) {
    if (!PRIVY_SERVER_CONFIGURED) return { error: NextResponse.json({ error: "Privy app secret not configured; pictures need a verified creator" }, { status: 500 }) };
    const verified = await verifyPrivyToken(bearer);
    if (!verified || verified === "unconfigured") return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
    if (!m.creator_did || m.creator_did !== verified.did) return { error: NextResponse.json({ error: "Only the creator can change this token's picture" }, { status: 403 }) };
    return { m, auth: { kind: "did", did: verified.did } as Auth };
  }

  const signer = sig.signer?.toLowerCase();
  if (signer && sig.signature) {
    if (!m.creator_address || signer !== m.creator_address.toLowerCase()) return { error: NextResponse.json({ error: "Only the creator can change this token's picture" }, { status: 403 }) };
    return { m, auth: { kind: "wallet", signer: sig.signer as Address, signature: sig.signature as Hex } as Auth };
  }
  return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
}

/** For the wallet path: the signature must be over exactly this message, from the creator's address. */
async function checkSignature(auth: Auth, message: string): Promise<boolean> {
  if (auth.kind !== "wallet") return true;
  return verifyMessage({ address: auth.signer, message, signature: auth.signature }).catch(() => false);
}

function pagePath(m: MojiRow) {
  const base = `/m/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}`;
  return m.chain_id !== 4663 ? `${base}/${m.chain_id}` : base;
}

function revalidate(m: MojiRow) {
  for (const p of [pagePath(m), `/m/${encodeURIComponent(m.display)}`, "/", "/explore", "/leaderboard", "/me"]) revalidatePath(p);
}

export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  let file: File | null = null;
  let sig: { signer?: string | null; signature?: string | null } = {};
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    sig = { signer: form.get("signer")?.toString(), signature: form.get("signature")?.toString() };
  } catch {
    return NextResponse.json({ error: "Send the picture as multipart form data under `file`" }, { status: 400 });
  }
  const r = await resolve(req, ctx, sig);
  if ("error" in r) return r.error;
  const m = r.m;

  if (!file || file.size === 0) return NextResponse.json({ error: "No picture attached" }, { status: 400 });
  if (file.size > MEME_MAX_BYTES) return NextResponse.json({ error: "Pictures are capped at 4 MB" }, { status: 413 });
  const input = Buffer.from(await file.arrayBuffer());
  if (!(await checkSignature(r.auth, memeSetMessage(m.id, createHash("sha256").update(input).digest("hex"))))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  let processed;
  try {
    processed = await processMeme(input);
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

export async function PATCH(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { details?: unknown; signer?: string; signature?: string };
  if (typeof body.details !== "string") return NextResponse.json({ error: "Send the details as a JSON string under `details`" }, { status: 400 });
  const r = await resolve(req, ctx, body);
  if ("error" in r) return r.error;
  const m = r.m;
  if (!(await checkSignature(r.auth, memeDetailsMessage(m.id, createHash("sha256").update(body.details, "utf8").digest("hex"))))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.details);
  } catch {
    return NextResponse.json({ error: "`details` is not valid JSON" }, { status: 400 });
  }
  const clean = cleanMemeDetails(parsed);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  const d = clean.details;
  const patch = { description: d.description || null, x_url: d.x_url || null, telegram_url: d.telegram_url || null, website_url: d.website_url || null };
  const { error } = await supabaseServer().from("mojis").update(patch).eq("id", m.id);
  if (error) {
    console.error("meme details failed", error.message);
    return NextResponse.json({ error: "Could not save, try again" }, { status: 500 });
  }
  revalidate(m);
  return NextResponse.json({ details: d });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { signer?: string; signature?: string; ts?: number };
  const r = await resolve(req, ctx, body);
  if ("error" in r) return r.error;
  const m = r.m;
  if (r.auth.kind === "wallet") {
    const ts = Number(body.ts ?? 0);
    if (!ts || Math.abs(Date.now() - ts) > MEME_SIGNATURE_TTL_MS) return NextResponse.json({ error: "signature expired, try again" }, { status: 403 });
    if (!(await checkSignature(r.auth, memeRemoveMessage(m.id, ts)))) return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
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
