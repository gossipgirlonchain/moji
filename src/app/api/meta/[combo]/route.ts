import { NextResponse } from "next/server";
import { decodeCombo, validateCombo } from "@/lib/emoji";
import { getMoji } from "@/lib/data";
import { SITE_URL } from "@/lib/network";

export const dynamic = "force-dynamic";

/**
 * GET /api/meta/🍏 → ERC-20 token metadata JSON (this URL is the on-chain tokenURI).
 * image points at the PNG stored in Supabase Storage once the launch is recorded,
 * and at the live renderer before that, so wallets and Dexscreener always get a picture.
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const v = validateCombo(decodeCombo(combo));
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
  const m = await getMoji(v.display, u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
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
