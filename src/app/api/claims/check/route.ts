import { NextResponse } from "next/server";
import { validateCombo, normalizeCombo, EXTENSION_POOL } from "@/lib/emoji";
import { isClaimed, claimedSet } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/claims/check?combo=🍏&chainId=4663&pair=0x…
 * Claims are per pair (combo + chain + numeraire). Without a pair we can only validate the combo.
 * → { valid, normalized, claimed, needsPair?, owner?: { display, href }, suggestions: string[] }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const combo = searchParams.get("combo") ?? "";
  const chainId = Number(searchParams.get("chainId") ?? 0);
  const pair = searchParams.get("pair") ?? "";
  const v = validateCombo(combo);
  if (!v.ok) {
    return NextResponse.json({ valid: false, reason: v.reason, claimed: false, suggestions: [] });
  }
  if (!chainId || !/^0x[0-9a-fA-F]{40}$/.test(pair)) {
    return NextResponse.json({ valid: true, normalized: v.normalized, claimed: false, needsPair: true, suggestions: [] });
  }
  const { claimed, display, ticker } = await isClaimed(v.normalized, chainId, pair);

  let suggestions: string[] = [];
  if (claimed && v.emoji.length < 3) {
    const candidates = EXTENSION_POOL.map((e) => v.display + e).filter((c) => validateCombo(c).ok);
    const taken = await claimedSet(candidates.map(normalizeCombo), chainId, pair);
    suggestions = candidates.filter((c) => !taken.has(normalizeCombo(c))).slice(0, 3);
  }

  return NextResponse.json({
    valid: true,
    normalized: v.normalized,
    claimed,
    owner: claimed ? { display: display ?? v.display, href: `/m/${encodeURIComponent(display ?? v.display)}/${encodeURIComponent(ticker ?? "")}${chainId !== 4663 ? `/${chainId}` : ""}` } : undefined,
    suggestions,
  });
}
