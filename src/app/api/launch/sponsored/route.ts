import { NextResponse } from "next/server";
import { sponsorLaunch, sponsorStatus, type SponsorRequest } from "@/lib/sponsor";
import { getLinkedTwitter, hasLinkedWallet, verifyPrivyToken, PRIVY_SERVER_CONFIGURED } from "@/lib/privy-server";
import { isXExempt } from "@/config/whitelist";
import type { LaunchIdentity } from "@/lib/record-launch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/launch/sponsored → { enabled, open, chainIds, budgetUsd, spentUsd, remainingUsd, today, dailyMax }
 *
 * POST /api/launch/sponsored { combo, pair, creator, ts, signature[, chainId][, mcap] }
 *   or, for a memecoin, { kind: "meme", name, symbol, pair, creator, ts, signature } with `combo` = `$SYMBOL` and
 *   `name` in the signed message (keys in order: chainId, combo, creator, name, pair, ts).
 * moji pays the gas for every launch on Robinhood Chain: the app (a Privy bearer token with a linked X account, like
 * POST /api/launch) and wallets or agents (no header; `agent: true` marks an agent). Sign, with personal_sign from `creator`, the message
 *   "moji sponsored launch v1\n" + JSON.stringify({ chainId, combo, creator, pair, ts })   (creator and pair
 * lowercased, pair as the address from /api/pairs, ts now in ms). The sponsor wallet sends the Airlock create
 * with `creator` as the moji's creator and fee beneficiary, waits for the receipt, verifies and records it.
 * While the budget lasts. Takes up to a minute; the response is the same as POST /api/launch
 * plus `txHash` and `gasUsd`.
 */
export async function GET() {
  return NextResponse.json(await sponsorStatus(), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  let body: SponsorRequest;
  try {
    body = (await req.json()) as SponsorRequest;
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "BAD_JSON" }, { status: 400 });
  }
  // Who is launching: the app's X user, or a wallet / agent.
  let who: LaunchIdentity = { kind: (body as { agent?: boolean }).agent === true ? "agent" : "wallet", did: null, handle: null };
  const auth = req.headers.get("authorization");
  if (auth) {
    if (!PRIVY_SERVER_CONFIGURED) return NextResponse.json({ error: "Privy app secret not configured", code: "SERVER_MISCONFIGURED" }, { status: 500 });
    const verified = await verifyPrivyToken(auth);
    if (!verified || verified === "unconfigured") return NextResponse.json({ error: "Not logged in", code: "UNAUTHENTICATED" }, { status: 401 });
    const twitter = await getLinkedTwitter(verified.did);
    if (!twitter) {
      const exempt = isXExempt(body.creator) && (await hasLinkedWallet(verified.did, body.creator));
      if (!exempt) return NextResponse.json({ error: "Link X to claim", code: "X_REQUIRED" }, { status: 403 });
    }
    who = { kind: "x", did: verified.did, handle: twitter?.username ?? null };
  }
  const r = await sponsorLaunch(body, who);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, sponsored: true, txHash: r.txHash, gasUsd: r.gasUsd, moji: r.moji, href: r.href, url: r.url, creatorKind: who.kind });
}
