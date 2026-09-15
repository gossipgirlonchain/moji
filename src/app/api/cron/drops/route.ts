import { NextResponse } from "next/server";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { scanHolders } from "@/lib/drops/holders";
import { expireDropsActive } from "@/lib/drops/drops";
import { dropsAllowlisted } from "@/lib/drops/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RUN_BUDGET_MS = 240_000;
const PER_MOJI_BUDGET_MS = 45_000;

/**
 * Vercel cron target (vercel.json, every 10 minutes). Protected by CRON_SECRET.
 *
 * Keeps every moji's holder index warm so a creator never opens the drops page onto a cold backfill:
 * each run walks the pairs that use drops first (allowlist, anything that has dropped), then every
 * other moji in order of staleness, and advances each one's cursor by at most 45s of work. Because
 * the cursor persists per chunk, a busy token catches up over a few runs and after that every run is
 * only the last ten minutes of blocks. Also clears the 🪂 pill on mojis that have not dropped in 14 days.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now();
  const sb = supabaseServer();
  const { data: dropped } = await sb.from("drops").select("moji_id").gt("sent_count", 0);
  const droppedIds = new Set(((dropped ?? []) as { moji_id: string }[]).map((d) => d.moji_id));
  const { data: all } = await sb.from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null).order("holders_scanned_at", { ascending: true, nullsFirst: true }).limit(2000);
  const rows = (all ?? []) as MojiRow[];
  const first = rows.filter((m) => dropsAllowlisted(m) || droppedIds.has(m.id));
  const rest = rows.filter((m) => !first.includes(m));
  const queue = [...first, ...rest];

  let scanned = 0;
  let incomplete = 0;
  let scanErrors = 0;
  let firstError: string | undefined;
  for (const m of queue) {
    const left = RUN_BUDGET_MS - (Date.now() - t0);
    if (left < 5_000) break;
    try {
      const r = await scanHolders(m, { maxChunks: 200, budgetMs: Math.min(PER_MOJI_BUDGET_MS, left) });
      scanned++;
      if (r && !r.complete) incomplete++;
    } catch (e) {
      scanErrors++;
      firstError ??= `${m.display}/${m.stock_ticker}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const expired = await expireDropsActive();
  return NextResponse.json({ queued: queue.length, scanned, incomplete, scanErrors, firstError, expired, ms: Date.now() - t0 });
}
