import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { getDrop, listPayouts, recordSent } from "@/lib/drops/drops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mojis/[combo]/drops/[id]/sent { txHashes: string[] }
 * Confirms holder transfers and the fee transfer from their receipts. Amounts come from the chain, not the client.
 */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string; id: string }> }) {
  const { combo, id } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { txHashes?: string[] };
  const hashes = (body.txHashes ?? []).filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)) as Hex[];
  if (hashes.length === 0) return NextResponse.json({ error: "no tx hashes" }, { status: 400 });
  const drop = await getDrop(id, m.id);
  if (!drop) return NextResponse.json({ error: "drop not found" }, { status: 404 });
  if (drop.status === "cancelled") return NextResponse.json({ error: "this drop was cancelled" }, { status: 400 });
  try {
    const out = await recordSent(m, drop, hashes.slice(0, 50));
    return NextResponse.json({ ...out, payouts: await listPayouts(drop.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
