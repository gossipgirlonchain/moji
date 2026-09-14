import { NextResponse } from "next/server";
import { parseCardParams } from "@/lib/card/params";
import { renderCard } from "@/lib/card/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/card?template=&w=&h=&seed=&...fields -> PNG
 *
 * The single renderer for social cards. /design builds these URLs for its preview and download, and the
 * post queue calls the same route, so there is one source of truth for the brand. The same query string
 * always produces the same image, so responses are cached immutably.
 *
 * Templates and fields (see src/lib/card/params.ts):
 *   announcement  headline, subline?
 *   pair          combo, ticker, label?
 *   leaderboard   title, row=emoji|pair|figure (x3)
 *   open          title, item=emoji|ticker (6 to 8)
 *   claimed       title, tile=emoji|ticker (8 to 12), count
 *   bignumber     pair, figure, label?
 * Sizes: w=1200&h=1200 (default) or w=1600&h=900. seed reshuffles the emoji scatter.
 */
export async function GET(req: Request) {
  const parsed = parseCardParams(new URL(req.url).searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const res = await renderCard(parsed.spec);
    res.headers.set("cache-control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.headers.set("content-disposition", `inline; filename="moji-${parsed.spec.template}.png"`);
    return res;
  } catch (e) {
    console.error("card render failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "render failed" }, { status: 500 });
  }
}
