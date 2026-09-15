import { NextResponse } from "next/server";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { scanHolders } from "@/lib/drops/holders";
import { expireDropsActive } from "@/lib/drops/drops";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel cron target (vercel.json, every 10 minutes). Protected by CRON_SECRET.
 * Keeps holder balances fresh (allowlisted / recently dropping mojis first, then the stalest) and
 * clears the 🪂 pill on mojis that have not dropped in a while. Drops themselves are sent by creators.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now();
  const u = new URL(req.url);
  const limit = Number(u.searchParams.get("limit") ?? 20);
  const sb = supabaseServer();
  const { data: active } = await sb.from("mojis").select("*").eq("network", NETWORK).eq("drops_active", true).not("token_address", "is", null).limit(limit);
  const { data: rest } = await sb.from("mojis").select("*").eq("network", NETWORK).eq("drops_active", false).not("token_address", "is", null).order("holders_scanned_at", { ascending: true, nullsFirst: true }).limit(limit);
  const seen = new Set<string>();
  const queue = [...((active ?? []) as MojiRow[]), ...((rest ?? []) as MojiRow[])].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  let scanned = 0;
  let scanErrors = 0;
  let firstError: string | undefined;
  for (const m of queue) {
    if (Date.now() - t0 > 240_000) break;
    try {
      await scanHolders(m, { maxChunks: 10 });
      scanned++;
    } catch (e) {
      scanErrors++;
      firstError ??= e instanceof Error ? e.message : String(e);
    }
  }
  const expired = await expireDropsActive();
  return NextResponse.json({ scanned, scanErrors, firstError, expired, ms: Date.now() - t0 });
}
