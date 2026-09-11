import { NextResponse } from "next/server";
import { getMoji } from "@/lib/data";
import { getMojiFees } from "@/lib/fees";
import { getMarket } from "@/lib/market";
import { decodeCombo } from "@/lib/emoji";

export const dynamic = "force-dynamic";

/** GET /api/mojis/[combo]/fees → live pending fees + schedule, same reader as the page. */
export async function GET(_req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const m = await getMoji(decodeCombo(combo));
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const market = await getMarket(m);
  const fees = await getMojiFees(m, { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd });
  return NextResponse.json({ fees, market }, { headers: { "cache-control": "no-store" } });
}
