import { NextResponse } from "next/server";
import { validateCombo, normalizeCombo, EXTENSION_POOL } from "@/lib/emoji";
import { isClaimed, claimedSet } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/claims/check?combo=🍏
 * → { valid, normalized, claimed, owner?: { display, href }, suggestions: string[] }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const combo = searchParams.get("combo") ?? "";
  const v = validateCombo(combo);
  if (!v.ok) {
    return NextResponse.json({ valid: false, reason: v.reason, claimed: false, suggestions: [] });
  }
  const { claimed, display } = await isClaimed(v.normalized);

  let suggestions: string[] = [];
  if (claimed && v.emoji.length < 3) {
    const candidates = EXTENSION_POOL.map((e) => v.display + e).filter((c) => validateCombo(c).ok);
    const taken = await claimedSet(candidates.map(normalizeCombo));
    suggestions = candidates.filter((c) => !taken.has(normalizeCombo(c))).slice(0, 3);
  }

  return NextResponse.json({
    valid: true,
    normalized: v.normalized,
    claimed,
    owner: claimed ? { display: display ?? v.display, href: `/m/${encodeURIComponent(display ?? v.display)}` } : undefined,
    suggestions,
  });
}
