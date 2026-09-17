import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { isTemplate } from "@/lib/card/params";
import { fillFor, isMetric, isStat } from "@/lib/social";

export const dynamic = "force-dynamic";

/**
 * GET /api/design/fill?template=&metric=&stat=&combo=&ticker= (admin cookie)
 * The template's fields from live data, same queries as the post queue. `metric` ranks the leaderboard
 * (fees, volume7d, volume24, mcap), `stat` picks the big number (mover or a protocol total), and
 * `combo` + `ticker` name the pair for the token card.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const template = sp.get("template");
  if (!isTemplate(template)) return NextResponse.json({ error: "unknown template" }, { status: 400 });
  const metric = sp.get("metric");
  const stat = sp.get("stat");
  try {
    const fields = await fillFor(template, {
      metric: isMetric(metric) ? metric : undefined,
      stat: isStat(stat) ? stat : undefined,
      combo: sp.get("combo") ?? undefined,
      ticker: sp.get("ticker") ?? undefined,
    });
    const why = template === "token" ? "no moji found for that pair" : template === "airdrop" || template === "airdrops" ? "no airdrops have paid holders yet" : `no live data for ${template}`;
    if (!fields) return NextResponse.json({ error: why }, { status: 404 });
    return NextResponse.json({ fields });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fill failed" }, { status: 500 });
  }
}
