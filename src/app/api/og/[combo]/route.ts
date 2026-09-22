import { renderOgImage } from "@/lib/render";
import { decodeCombo, validateCombo } from "@/lib/emoji";
import { getMoji } from "@/lib/data";
import { isMemeCombo } from "@/lib/meme-coin";

export const runtime = "nodejs";
export const revalidate = 60;

/** GET /api/og/[combo]?chain=&pair=  → 1200×630 share image for that pair. */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const decoded = decodeCombo(combo);
  const v = validateCombo(decoded);
  const ok = v.ok || isMemeCombo(decoded);
  const display = v.ok ? v.display : isMemeCombo(decoded) ? decoded : "🫥";
  const m = ok ? await getMoji(display, u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null) : null;
  return renderOgImage(display, m?.stock_ticker ?? "moji", m?.meme_url ?? null);
}
