import { renderMemePlaceholder } from "@/lib/render";
import { memeDisplay, validateMemeSymbol } from "@/lib/memecoin";

export const runtime = "nodejs";
export const revalidate = 3600;

/** GET /api/img/meme/PEPE → 512x512 placeholder token image for a MEME launch before (or without) its picture. */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const sy = validateMemeSymbol(decodeURIComponent(symbol));
  return renderMemePlaceholder(sy.ok ? memeDisplay(sy.symbol) : "$MEME");
}
