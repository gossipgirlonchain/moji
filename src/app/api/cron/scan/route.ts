import { NextResponse } from "next/server";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { claimPatch, scanClaims } from "@/lib/fee-scan";
import { NETWORK } from "@/lib/network";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Debug: scan one moji's claim history and return the raw result or the error. GET ?combo=🍎&ticker=AAPL (CRON_SECRET). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  let q = supabaseServer().from("mojis").select("*").eq("network", NETWORK).eq("display", u.searchParams.get("combo") ?? "");
  if (u.searchParams.get("ticker")) q = q.eq("stock_ticker", u.searchParams.get("ticker")!);
  const { data } = await q.limit(1);
  const m = (data ?? [])[0] as MojiRow | undefined;
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const scan = await scanClaims(m, { maxChunks: Number(u.searchParams.get("chunks") ?? 400) });
    let write: unknown = undefined;
    if (scan && u.searchParams.get("write")) {
      const patch = claimPatch(m, scan, { stockUsd: Number(u.searchParams.get("stockUsd") ?? 0), mojiUsd: Number(u.searchParams.get("mojiUsd") ?? 0) });
      let q = supabaseServer().from("mojis").update(patch).eq("id", m.id);
      q = m.fees_scanned_block == null ? q.is("fees_scanned_block", null) : q.eq("fees_scanned_block", m.fees_scanned_block);
      const r = await q.select("id, fees_scanned_block, fees_claim_count");
      write = { patch, data: r.data, error: r.error, status: r.status };
    }
    return NextResponse.json({ tx: m.tx_hash, scanned: m.fees_scanned_block, scan: scan && { ...scan, scannedBlock: scan.scannedBlock.toString() }, write });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e).slice(0, 800), stack: String((e as Error).stack).split("\n").slice(0, 6) }, { status: 500 });
  }
}
