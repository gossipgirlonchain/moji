import { NextResponse } from "next/server";
import { getMoji } from "@/lib/data";
import { getPriceSeries } from "@/lib/market";
import { decodeCombo } from "@/lib/emoji";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const range = (new URL(req.url).searchParams.get("range") ?? "1D") as "1H" | "4H" | "1D" | "7D" | "ALL";
  const m = await getMoji(decodeCombo(combo));
  if (!m) return NextResponse.json({ points: [] }, { status: 404 });
  const points = await getPriceSeries(m, range);
  return NextResponse.json({ points });
}
