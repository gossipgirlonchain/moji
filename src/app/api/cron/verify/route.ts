import { NextResponse } from "next/server";
import { verifyLaunchTx } from "@/lib/launch-verify";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";

export const dynamic = "force-dynamic";

/** Debug: run the on-chain launch check for a tx. GET ?chain=&tx=&token=&creator=&numeraire= (CRON_SECRET). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const g = (k: string) => u.searchParams.get(k) ?? "";
  if (g("all")) {
    // Sweep every recorded moji through the same check, oldest first.
    const { data } = await supabaseServer().from("mojis").select("display, stock_ticker, chain_id, tx_hash, token_address, creator_address, stock_address, launched_at").eq("network", NETWORK).order("launched_at", { ascending: true }).limit(1000);
    const rows = (data ?? []) as MojiRow[];
    const out: { moji: string; chain: number; launched: string; ok: boolean; reason?: string }[] = [];
    const queue = [...rows];
    const worker = async () => {
      while (queue.length) {
        const m = queue.shift()!;
        let r: Awaited<ReturnType<typeof verifyLaunchTx>>;
        try {
          r = m.tx_hash && m.token_address && m.creator_address
            ? await verifyLaunchTx({ chainId: m.chain_id, txHash: m.tx_hash as `0x${string}`, tokenAddress: m.token_address as `0x${string}`, creatorAddress: m.creator_address as `0x${string}`, numeraire: m.stock_address as `0x${string}` })
            : { ok: false, reason: "row has no tx/token/creator" };
        } catch (e) {
          r = { ok: false, reason: "error: " + String((e as Error).message).slice(0, 120) };
        }
        out.push({ moji: `${m.display}/${m.stock_ticker}`, chain: m.chain_id, launched: m.launched_at, ok: r.ok, ...(r.ok ? {} : { reason: r.reason }) });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    out.sort((a, b) => a.launched.localeCompare(b.launched));
    return NextResponse.json({ total: out.length, failed: out.filter((o) => !o.ok).length, rows: out });
  }
  const r = await verifyLaunchTx({ chainId: Number(g("chain")), txHash: g("tx") as `0x${string}`, tokenAddress: g("token") as `0x${string}`, creatorAddress: g("creator") as `0x${string}`, numeraire: g("numeraire") as `0x${string}` });
  return NextResponse.json({ ...r, blockNumber: "blockNumber" in r ? r.blockNumber.toString() : undefined });
}
