import { renderOgImage } from "@/lib/render";
import { decodeCombo, validateCombo } from "@/lib/emoji";
import { getMoji } from "@/lib/data";

export const runtime = "nodejs";
export const alt = "moji";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ combo: string }> }) {
  const { combo } = await params;
  const v = validateCombo(decodeCombo(combo));
  const display = v.ok ? v.display : "🫥";
  const m = v.ok ? await getMoji(v.display) : null;
  return renderOgImage(display, m?.stock_ticker ?? "moji");
}
