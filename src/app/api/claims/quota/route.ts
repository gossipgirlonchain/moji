import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy-server";
import { launchQuota } from "@/lib/limits";
import { WALLET_CLAIMS_OPEN } from "@/config/limits";

export const dynamic = "force-dynamic";

/**
 * GET /api/claims/quota                 (Privy bearer)  → can this X account launch another moji right now?
 * GET /api/claims/quota?creator=0x…     (no auth)       → same question for a bare wallet (launch slots, nothing dies)
 */
export async function GET(req: Request) {
  const creator = new URL(req.url).searchParams.get("creator") ?? "";
  const auth = req.headers.get("authorization");
  if (!auth && WALLET_CLAIMS_OPEN && /^0x[0-9a-fA-F]{40}$/.test(creator)) {
    const q = await launchQuota({ address: creator });
    return NextResponse.json(q, { headers: { "cache-control": "no-store" } });
  }
  const verified = await verifyPrivyToken(auth);
  if (!verified || verified === "unconfigured") return NextResponse.json({ error: "Not logged in", code: "UNAUTHENTICATED" }, { status: 401 });
  const q = await launchQuota({ did: verified.did });
  return NextResponse.json(q, { headers: { "cache-control": "no-store" } });
}
