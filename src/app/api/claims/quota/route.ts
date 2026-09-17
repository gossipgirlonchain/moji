import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy-server";
import { launchQuota } from "@/lib/limits";

export const dynamic = "force-dynamic";

/** GET /api/claims/quota (Privy bearer) → can this account launch another moji right now? */
export async function GET(req: Request) {
  const verified = await verifyPrivyToken(req.headers.get("authorization"));
  if (!verified || verified === "unconfigured") return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const q = await launchQuota(verified.did);
  return NextResponse.json(q, { headers: { "cache-control": "no-store" } });
}
