import { NextResponse } from "next/server";
import { renderTokenImage } from "@/lib/render";
import { decodeCombo, validateCombo } from "@/lib/emoji";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/img/🍏 → 512x512 PNG token image. */
export async function GET(_req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const v = validateCombo(decodeCombo(combo));
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
  const res = renderTokenImage(v.display);
  res.headers.set("cache-control", "public, max-age=86400, s-maxage=86400, immutable");
  return res;
}
