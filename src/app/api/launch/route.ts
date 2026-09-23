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
import { recordLaunch } from "@/lib/record-launch";
import { validateMeme } from "@/lib/meme-coin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLAIM_WINDOW_MS = 15 * 60 * 1000;

type Body = {
  /** 'moji' (default): `combo` is 1 to 3 emoji. 'meme': a traditional memecoin, `name` (title) + `symbol` (ticker) instead. */
  kind?: "moji" | "meme";
  combo?: string;
  name?: string;
  symbol?: string;
  chainId: number;
  stockAddress: string;
  tokenAddress: string;
  poolId?: string;
  txHash: string;
  supply?: string;
  creatorAddress: string;
  /** Wallet path only: the launcher says it is an autonomous agent. Shown as 🤖 on the moji. */
  agent?: boolean;
  /** who earns the creator's fee share when it is not the creator (must match the pool's beneficiaries on-chain) */
  feeRecipient?: string | null;
};

type Identity = { kind: "x"; did: string; handle: string | null } | { kind: "wallet" | "agent"; did: null; handle: null };

const fail = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

/**
 * POST /api/launch
 * Records a successful on-chain launch: a moji (`combo`) or, with `kind: "meme"`, a memecoin (`name` + `symbol`).
 * Rules enforced here, not on the client:
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

  // What was launched: an emoji combo, or a meme whose ticker is the claim (`$pepe`, src/lib/meme-coin.ts).
  let v: Extract<ReturnType<typeof validateCombo>, { ok: true }>;
  let meme: { name: string; symbol: string } | null = null;
  if (body.kind === "meme") {
    const mv = validateMeme(body);
    if (!mv.ok) return fail(mv.reason, "BAD_MEME", 400);
    meme = { name: mv.name, symbol: mv.symbol };
    v = { ok: true, emoji: [], display: mv.display, normalized: mv.normalized };
  } else {
    const cv = validateCombo(body.combo ?? "");
    if (!cv.ok) return fail(cv.reason, "BAD_COMBO", 400);
    v = cv;
  }

  const chain = chainById(Number(body.chainId));
  if (!chain || !chainLaunchable(chain)) return fail("That chain is not live yet", "CHAIN_NOT_LIVE", 400);

  const stock = findNumeraire(chain.chainId, body.stockAddress);
  if (!stock) return fail("Pair must be a listed stock or token on this chain", "PAIR_NOT_LISTED", 400);

  if (!/^0x[0-9a-fA-F]{40}$/.test(body.tokenAddress ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) {
    return fail("Bad token address or tx hash", "BAD_INPUT", 400);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.creatorAddress ?? "")) return fail("Bad creator address", "BAD_INPUT", 400);
  const feeRecipient = body.feeRecipient && !/^0x[0-9a-fA-F]{40}$/.test(body.feeRecipient) ? undefined : body.feeRecipient && body.feeRecipient.toLowerCase() !== body.creatorAddress.toLowerCase() ? body.feeRecipient : null;
  if (feeRecipient === undefined) return fail("Bad fee recipient address", "BAD_INPUT", 400);

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
  const proof = await verifyLaunchTx({ chainId: chain.chainId, txHash: body.txHash as `0x${string}`, tokenAddress: body.tokenAddress as `0x${string}`, creatorAddress: body.creatorAddress as `0x${string}`, numeraire: stock.address, feeRecipient: feeRecipient as `0x${string}` | null });
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

  const rec = await recordLaunch({ v, meme, feeRecipient, chain, stock, tokenAddress: body.tokenAddress, poolId: body.poolId ?? null, txHash: body.txHash, supply: body.supply ?? null, creatorAddress: body.creatorAddress, who });
  if (!rec.ok) return fail(rec.error, rec.code, rec.status);
  return NextResponse.json({ moji: rec.moji, href: rec.href, url: rec.url, handle: who.handle, creatorKind: who.kind });
}
