import { NextResponse } from "next/server";
import { validateCombo } from "@/lib/emoji";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { getLinkedTwitter, verifyPrivyToken, PRIVY_SERVER_CONFIGURED } from "@/lib/privy-server";
import { findNumeraire, chainLaunchable } from "@/lib/numeraire";
import { chainById } from "@/config/chains";
import { NETWORK, SITE_URL } from "@/lib/network";
import { storeMojiImage } from "@/lib/images";
import { refreshOne } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLAIM_WINDOW_MS = 15 * 60 * 1000;

type Body = {
  combo: string;
  chainId: number;
  stockAddress: string;
  tokenAddress: string;
  poolId?: string;
  txHash: string;
  supply?: string;
  creatorAddress: string;
};

/**
 * POST /api/launch
 * Records a successful on-chain launch. Rules enforced here, not on the client:
 *  - caller must present a valid Privy access token (DID)
 *  - that DID must have a linked X account (read from Privy server-side)
 *  - one claim per DID per 15 minutes
 *  - chain must be live, stock must be on the curated list
 * Inserts the claim (unique index on (combo, network) is the permanence guarantee) and the moji row,
 * then renders the token image into Supabase Storage.
 */
export async function POST(req: Request) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase service role key not configured" }, { status: 500 });
  }
  if (!PRIVY_SERVER_CONFIGURED) {
    return NextResponse.json({ error: "Privy app secret not configured; claims require X verification" }, { status: 500 });
  }
  const body = (await req.json()) as Body;

  const v = validateCombo(body.combo ?? "");
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

  const chain = chainById(Number(body.chainId));
  if (!chain || !chainLaunchable(chain)) return NextResponse.json({ error: "That chain is not live yet" }, { status: 400 });

  const stock = findNumeraire(chain.chainId, body.stockAddress);
  if (!stock) return NextResponse.json({ error: "Pair must be a listed stock or token on this chain" }, { status: 400 });

  if (!/^0x[0-9a-fA-F]{40}$/.test(body.tokenAddress ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) {
    return NextResponse.json({ error: "Bad token address or tx hash" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.creatorAddress ?? "")) return NextResponse.json({ error: "Bad creator address" }, { status: 400 });

  const verified = await verifyPrivyToken(req.headers.get("authorization"));
  if (!verified || verified === "unconfigured") return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const did = verified.did;

  const twitter = await getLinkedTwitter(did);
  if (!twitter) return NextResponse.json({ error: "Link X to claim" }, { status: 403 });

  const sb = supabaseServer();

  // Rate limit: one claim per X account (DID) per 15 minutes.
  const since = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
  const { data: recent } = await sb.from("mojis").select("launched_at").eq("creator_did", did).gte("launched_at", since).order("launched_at", { ascending: false }).limit(1);
  if (recent && recent.length > 0) {
    const next = new Date(new Date(recent[0].launched_at).getTime() + CLAIM_WINDOW_MS);
    const mins = Math.max(1, Math.ceil((next.getTime() - Date.now()) / 60000));
    return NextResponse.json({ error: `One claim every 15 minutes. Try again in ${mins} min.` }, { status: 429 });
  }

  const { error: claimErr } = await sb.from("claims").insert({ combo: v.normalized, display: v.display, chain_id: chain.chainId, network: NETWORK });
  if (claimErr) {
    const conflict = claimErr.code === "23505";
    return NextResponse.json({ error: conflict ? "That combo was just claimed" : claimErr.message }, { status: conflict ? 409 : 500 });
  }

  const metadataUrl = `${SITE_URL}/api/meta/${encodeURIComponent(v.display)}`;
  const { data, error } = await sb
    .from("mojis")
    .insert({
      combo: v.normalized,
      display: v.display,
      network: NETWORK,
      chain_id: chain.chainId,
      stock_ticker: stock.ticker,
      stock_address: stock.address,
      token_address: body.tokenAddress,
      pool_id: body.poolId ?? null,
      tx_hash: body.txHash,
      supply: body.supply ?? null,
      creator_did: did,
      creator_handle: twitter.username,
      creator_address: body.creatorAddress,
      metadata_url: metadataUrl,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Token image into Storage (best effort; the metadata route falls back to a live render).
  let imageUrl: string | null = null;
  try {
    imageUrl = await storeMojiImage(v.display, v.normalized);
    if (imageUrl) await sb.from("mojis").update({ image_url: imageUrl }).eq("id", data.id);
  } catch (e) {
    console.error("image store failed", e);
  }

  // Snapshot so the new row shows a price on the next home/explore render (cron refreshes fees within 2 min).
  try {
    await refreshOne(data as never);
  } catch {}

  const href = `/m/${encodeURIComponent(v.display)}`;
  return NextResponse.json({ moji: { ...data, image_url: imageUrl }, href, url: `${SITE_URL}${href}`, handle: twitter.username });
}
