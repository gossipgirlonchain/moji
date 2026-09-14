import { NextResponse } from "next/server";
import { verifyLaunchTx } from "@/lib/launch-verify";

export const dynamic = "force-dynamic";

/** Debug: run the on-chain launch check for a tx. GET ?chain=&tx=&token=&creator=&numeraire= (CRON_SECRET). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const g = (k: string) => u.searchParams.get(k) ?? "";
  const r = await verifyLaunchTx({ chainId: Number(g("chain")), txHash: g("tx") as `0x${string}`, tokenAddress: g("token") as `0x${string}`, creatorAddress: g("creator") as `0x${string}`, numeraire: g("numeraire") as `0x${string}` });
  return NextResponse.json({ ...r, blockNumber: "blockNumber" in r ? r.blockNumber.toString() : undefined });
}
