import { NextResponse } from "next/server";
import { decodeCombo, validateCombo } from "@/lib/emoji";
import { getMoji } from "@/lib/data";
import { SITE_URL } from "@/lib/network";
import { isMemeCombo } from "@/lib/meme-coin";

export const dynamic = "force-dynamic";

/**
 * GET /api/meta/🍏 → ERC-20 token metadata JSON (this URL is the on-chain tokenURI).
 * image points at the PNG stored in Supabase Storage once the launch is recorded,
 * and at the live renderer before that, so wallets and Dexscreener always get a picture.
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const decoded = decodeCombo(combo);
  const pair = u.searchParams.get("pair");
  const chain = Number(u.searchParams.get("chain") ?? 0) || null;
  // A meme (`$PEPE`): its title and ticker are the token's name and symbol, its picture the image.
  if (isMemeCombo(decoded)) {
    const m = await getMoji(decoded, pair, chain);
    if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(
      {
        name: m.name ?? m.display,
        symbol: m.symbol ?? m.display.slice(1),
        description: m.description || `${m.name ?? m.display} is a meme on moji, paired to $${m.stock_ticker}. moji.wtf`,
        image: m.image_url ?? m.meme_url ?? null,
        external_url: `${SITE_URL}/m/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}`,
        attributes: [{ trait_type: "kind", value: "meme" }, { trait_type: "pair", value: m.stock_ticker }, { trait_type: "chain", value: String(m.chain_id) }],
      },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  }
  const v = validateCombo(decoded);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
  const m = await getMoji(v.display, pair, chain);
  const image = m?.image_url ?? `${SITE_URL}/api/img/${encodeURIComponent(v.display)}`;
  return NextResponse.json(
    {
      name: v.display,
      symbol: v.display,
      description: m ? `${v.display} is a moji, paired to $${m.stock_ticker}. moji.wtf` : `${v.display} is a moji. moji.wtf`,
      image,
      external_url: m ? `${SITE_URL}/m/${encodeURIComponent(v.display)}/${encodeURIComponent(m.stock_ticker)}` : `${SITE_URL}/m/${encodeURIComponent(v.display)}`,
      ...(m ? { attributes: [{ trait_type: "pair", value: m.stock_ticker }, { trait_type: "chain", value: String(m.chain_id) }] } : {}),
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
