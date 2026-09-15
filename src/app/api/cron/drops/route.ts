import { NextResponse } from "next/server";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { scanHolders } from "@/lib/drops/holders";
import { expireDropsActive } from "@/lib/drops/drops";
import { dropsAllowlisted } from "@/lib/drops/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel cron target (vercel.json, every 10 minutes). Protected by CRON_SECRET.
 * Scans holders only for the pairs that use drops: the allowlist plus any moji that has ever dropped.
 * Nothing else is touched. Also clears the 🪂 pill on mojis that have not dropped in 14 days.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now();
  const sb = supabaseServer();
  const { data: dropped } = await sb.from("drops").select("moji_id").gt("sent_count", 0);
  const droppedIds = new Set(((dropped ?? []) as { moji_id: string }[]).map((d) => d.moji_id));
  const { data: all } = await sb.from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null).limit(2000);
  const queue = ((all ?? []) as MojiRow[]).filter((m) => dropsAllowlisted(m) || droppedIds.has(m.id));

  let scanned = 0;
  let scanErrors = 0;
  let firstError: string | undefined;
  for (const m of queue) {
    if (Date.now() - t0 > 240_000) break;
    try {
      await scanHolders(m, { maxChunks: 20 });
      scanned++;
    } catch (e) {
      scanErrors++;
      firstError ??= e instanceof Error ? e.message : String(e);
    }
  }
  const expired = await expireDropsActive();
  return NextResponse.json({ pairs: queue.map((m) => `${m.display}/${m.stock_ticker}@${m.chain_id}`), scanned, scanErrors, firstError, expired, ms: Date.now() - t0 });
}
