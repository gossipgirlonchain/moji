import { renderOgImage } from "@/lib/render";
import { decodeCombo, validateCombo } from "@/lib/emoji";
import { getMoji } from "@/lib/data";

export const runtime = "nodejs";
export const revalidate = 60;

/** GET /api/og/[combo]?chain=&pair=  → 1200×630 share image for that pair. */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const v = validateCombo(decodeCombo(combo));
  const display = v.ok ? v.display : "🫥";
  const m = v.ok ? await getMoji(v.display, u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null) : null;
  return renderOgImage(display, m?.stock_ticker ?? "moji");
}
