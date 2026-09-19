import { NextResponse } from "next/server";
import { validateCombo } from "@/lib/emoji";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { hasLinkedWallet, getLinkedTwitter, verifyPrivyToken, PRIVY_SERVER_CONFIGURED } from "@/lib/privy-server";
import { isXExempt } from "@/config/whitelist";
import { launchQuota } from "@/lib/limits";
import { WALLET_CLAIMS_OPEN } from "@/config/limits";
import { verifyLaunchTx } from "@/lib/launch-verify";
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
  /** Wallet path only: the launcher says it is an autonomous agent. Shown as 🤖 on the moji. */
  agent?: boolean;
};

type Identity = { kind: "x"; did: string; handle: string | null } | { kind: "wallet" | "agent"; did: null; handle: null };

const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

/**
 * POST /api/launch
 * Records a successful on-chain launch. Rules enforced here, not on the client:
 *  - chain must be live, pair must be on the curated list
 *  - the tx hash must show the creator sending a moji-shaped Airlock create for this token and pair
 *    (fee beneficiaries carry the treasury and protocol shares, the integrator is ours): verifyLaunchTx
 *  - with a Privy access token: that DID must have a linked X account (read from Privy server-side),
 *    one claim per DID per 15 minutes, dead-moji cap on the DID
 *  - without one (WALLET_CLAIMS_OPEN): the wallet that sent the tx is the identity and its first moji is who it
 *    is: WALLET_LAUNCH_SLOTS launches per wallet, nothing dies. `agent: true` marks the row as an agent launch.
 * Inserts the claim (unique index on (combo, network) is the permanence guarantee) and the moji row,
 * then renders the token image into Supabase Storage.
 */
export async function POST(req: Request) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail("Supabase service role key not configured", "SERVER_MISCONFIGURED", 500);
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("Body must be JSON", "BAD_JSON", 400);
  }

  const v = validateCombo(body.combo ?? "");
  if (!v.ok) return fail(v.reason, "BAD_COMBO", 400);

  const chain = chainById(Number(body.chainId));
  if (!chain || !chainLaunchable(chain)) return fail("That chain is not live yet", "CHAIN_NOT_LIVE", 400);

  const stock = findNumeraire(chain.chainId, body.stockAddress);
  if (!stock) return fail("Pair must be a listed stock or token on this chain", "PAIR_NOT_LISTED", 400);

  if (!/^0x[0-9a-fA-F]{40}$/.test(body.tokenAddress ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) {
    return fail("Bad token address or tx hash", "BAD_INPUT", 400);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.creatorAddress ?? "")) return fail("Bad creator address", "BAD_INPUT", 400);

  // Who is claiming. A bearer token means the app's Privy + X path; none means the wallet path.
  const auth = req.headers.get("authorization");
  let who: Identity;
  if (auth || !WALLET_CLAIMS_OPEN) {
    if (!PRIVY_SERVER_CONFIGURED) return fail("Privy app secret not configured; claims require X verification", "SERVER_MISCONFIGURED", 500);
    const verified = await verifyPrivyToken(auth);
    if (!verified || verified === "unconfigured") return fail("Not logged in", "UNAUTHENTICATED", 401);
    // X is required, except for whitelisted wallets (treasury) that the logged-in user actually owns.
    const twitter = await getLinkedTwitter(verified.did);
    if (!twitter) {
      const exempt = isXExempt(body.creatorAddress) && (await hasLinkedWallet(verified.did, body.creatorAddress));
      if (!exempt) return fail("Link X to claim", "X_REQUIRED", 403);
    }
    who = { kind: "x", did: verified.did, handle: twitter?.username ?? null };
  } else {
    who = { kind: body.agent === true ? "agent" : "wallet", did: null, handle: null };
  }
  const launcher = who.did ? { did: who.did } : { address: body.creatorAddress };

  // Dead-moji cap for X accounts, launch slots for wallets (the launch page and the params endpoint check this
  // before anything is sent on-chain; this is the backstop).
  const quota = await launchQuota(launcher);
  if (quota.blocked) return fail(quota.message ?? "Launch cap reached", quota.rule === "dead" ? "DEAD_CAP" : "NO_SLOTS", 429);

  // The chain is the source of truth for what was launched: creator, token, pair, fee beneficiaries, integrator.
  const proof = await verifyLaunchTx({ chainId: chain.chainId, txHash: body.txHash as `0x${string}`, tokenAddress: body.tokenAddress as `0x${string}`, creatorAddress: body.creatorAddress as `0x${string}`, numeraire: stock.address });
  if (!proof.ok) return fail(`Launch not verified on-chain: ${proof.reason}`, proof.reason.includes("not found") ? "TX_NOT_FOUND" : "TX_NOT_VERIFIED", 422);

  const sb = supabaseServer();

  // Rate limit: one claim per X account (DID) per 15 minutes. Wallets are held by their slots instead.
  if (who.did) {
    const since = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
    const { data: recent } = await sb.from("mojis").select("launched_at").eq("creator_did", who.did).gte("launched_at", since).order("launched_at", { ascending: false }).limit(1);
    if (recent && recent.length > 0) {
      const next = new Date(new Date(recent[0].launched_at).getTime() + CLAIM_WINDOW_MS);
      const mins = Math.max(1, Math.ceil((next.getTime() - Date.now()) / 60000));
      return NextResponse.json({ error: `One claim every 15 minutes. Try again in ${mins} min.`, code: "RATE_LIMITED", retryAfterMinutes: mins }, { status: 429 });
    }
  }

  const { error: claimErr } = await sb.from("claims").insert({ combo: v.normalized, display: v.display, chain_id: chain.chainId, network: NETWORK, stock_address: stock.address });
  if (claimErr) {
    const conflict = claimErr.code === "23505";
    return fail(conflict ? `${v.display} is already paired to ${stock.ticker} on ${chain.short}` : claimErr.message, conflict ? "CLAIMED" : "DB_ERROR", conflict ? 409 : 500);
  }

  const metadataUrl = `${SITE_URL}/api/meta/${encodeURIComponent(v.display)}?chain=${chain.chainId}&pair=${stock.address}`;
  const row = {
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
    creator_did: who.did,
    creator_handle: who.handle,
    creator_address: body.creatorAddress,
    metadata_url: metadataUrl,
  };
  let { data, error } = await sb.from("mojis").insert({ ...row, creator_kind: who.kind }).select("*").single();
  // Before supabase/agents.sql is applied the column does not exist (PGRST204): record the launch without it.
  if (error?.code === "PGRST204") ({ data, error } = await sb.from("mojis").insert(row).select("*").single());
  if (error) return fail(error.message, "DB_ERROR", 500);

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

  const href = `/m/${encodeURIComponent(v.display)}/${encodeURIComponent(stock.ticker)}${chain.chainId !== 4663 ? `/${chain.chainId}` : ""}`;
  return NextResponse.json({ moji: { ...data, image_url: imageUrl }, href, url: `${SITE_URL}${href}`, handle: who.handle, creatorKind: who.kind });
}
