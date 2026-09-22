import { NextResponse } from "next/server";
import { getMeme } from "@/lib/data";
import { SITE_URL } from "@/lib/network";
import { memeDisplay, validateMemeSymbol } from "@/lib/memecoin";
import { mojiHref } from "@/lib/hrefs";

export const dynamic = "force-dynamic";

/** GET /api/meta/meme/PEPE?chain=&pair= → ERC-20 token metadata JSON for a MEME launch (the on-chain tokenURI). */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const u = new URL(req.url);
  const sy = validateMemeSymbol(decodeURIComponent(symbol));
  if (!sy.ok) return NextResponse.json({ error: sy.reason }, { status: 400 });
  const m = await getMeme(sy.symbol, u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  const image = m?.meme_url ?? m?.image_url ?? `${SITE_URL}/api/img/meme/${encodeURIComponent(sy.symbol)}`;
  return NextResponse.json(
    {
      name: m?.name ?? memeDisplay(sy.symbol),
      symbol: sy.symbol,
      description: m ? `${m.name ?? memeDisplay(sy.symbol)} (${memeDisplay(sy.symbol)}) is a meme on moji, paired to $${m.stock_ticker}. moji.wtf` : `${memeDisplay(sy.symbol)} is a meme on moji. moji.wtf`,
      image,
      external_url: m ? `${SITE_URL}${mojiHref(m)}` : SITE_URL,
      ...(m ? { attributes: [{ trait_type: "kind", value: "meme" }, { trait_type: "pair", value: m.stock_ticker }, { trait_type: "chain", value: String(m.chain_id) }] } : {}),
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
