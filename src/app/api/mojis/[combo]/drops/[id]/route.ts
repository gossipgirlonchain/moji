import { NextResponse } from "next/server";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { getDrop, listPayouts } from "@/lib/drops/drops";

export const dynamic = "force-dynamic";

/** GET /api/mojis/[combo]/drops/[id] → the drop and every payout, so a half-sent drop can be resumed. */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string; id: string }> }) {
  const { combo, id } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const drop = await getDrop(id, m.id);
  if (!drop) return NextResponse.json({ error: "drop not found" }, { status: 404 });
  return NextResponse.json({ drop, payouts: await listPayouts(drop.id) }, { headers: { "cache-control": "no-store" } });
}
