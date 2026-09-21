import { NextResponse } from "next/server";
import { runCopy } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel cron target (vercel.json, every 2 minutes). Protected by CRON_SECRET.
 * Runs the copy engine: new buys and sells by followed agents become trades from their followers' delegated
 * wallets, inside each follow's rules. A no-op until PRIVY_AUTHORIZATION_KEY is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runCopy({ budgetMs: 240_000 });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
