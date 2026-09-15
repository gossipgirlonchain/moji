import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { supabaseServer } from "@/lib/supabase";
import { dropsEnabled } from "@/lib/drops/gate";
import { holderSummary, scanHolders } from "@/lib/drops/holders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mojis/[combo]/holders?chain&pair
 * Holder stats rebuilt from Transfer logs. Runs an incremental scan first when the stored cursor is
 * older than 10 minutes (capped so the request stays under the function limit; the cron finishes it).
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  if (!(await dropsEnabled())) return NextResponse.json({ error: "not available" }, { status: 404 });
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  let m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m || !m.token_address) return NextResponse.json({ error: "not found" }, { status: 404 });
  const stale = !m.holders_scanned_at || Date.now() - new Date(m.holders_scanned_at).getTime() > 10 * 60_000;
  let scan = null;
  let scanError: string | undefined;
  if (stale || u.searchParams.get("scan") === "1") {
    try {
      scan = await scanHolders(m, { maxChunks: 8 });
      const { data } = await supabaseServer().from("mojis").select("*").eq("id", m.id).single();
      if (data) m = data as typeof m;
    } catch (e) {
      scanError = e instanceof Error ? e.message : String(e);
    }
  }
  const supply = m.supply ? parseUnits(String(m.supply), 18) : 10n ** 27n;
  const summary = await holderSummary(m, supply);
  return NextResponse.json({ summary, scan: scan ? { ...scan, scannedBlock: String(scan.scannedBlock) } : null, scanError }, { headers: { "cache-control": "no-store" } });
}
