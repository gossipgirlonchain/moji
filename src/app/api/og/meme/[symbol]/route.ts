import { renderOgImage } from "@/lib/render";
import { getMeme } from "@/lib/data";
import { memeDisplay, validateMemeSymbol } from "@/lib/memecoin";

export const runtime = "nodejs";
export const revalidate = 60;

/** GET /api/og/meme/PEPE?chain=&pair= → 1200×630 share image for a MEME launch. */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const u = new URL(req.url);
  const sy = validateMemeSymbol(decodeURIComponent(symbol));
  const display = sy.ok ? memeDisplay(sy.symbol) : "$MEME";
  const m = sy.ok ? await getMeme(sy.symbol, u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null) : null;
  return renderOgImage(display, m?.stock_ticker ?? "moji", m?.meme_url ?? null, m?.name ?? null);
}
