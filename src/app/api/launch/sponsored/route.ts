import { NextResponse } from "next/server";
import { sponsorLaunch, sponsorStatus, type SponsorRequest } from "@/lib/sponsor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/launch/sponsored → { enabled, open, chainIds, budgetUsd, spentUsd, remainingUsd, today, dailyMax }
 *
 * POST /api/launch/sponsored { combo, pair, creator, ts, signature[, chainId][, mcap] }
 * moji pays the gas for an agent's launch. Sign, with personal_sign from `creator`, the message
 *   "moji sponsored launch v1\n" + JSON.stringify({ chainId, combo, creator, pair, ts })   (creator and pair
 * lowercased, pair as the address from /api/pairs, ts now in ms). The sponsor wallet sends the Airlock create
 * with `creator` as the moji's creator and fee beneficiary, waits for the receipt, verifies and records it.
 * One per wallet, while the budget lasts. Takes up to a minute; the response is the same as POST /api/launch
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
  const r = await sponsorLaunch(body);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, sponsored: true, txHash: r.txHash, gasUsd: r.gasUsd, moji: r.moji, href: r.href, url: r.url, creatorKind: "agent" });
}
