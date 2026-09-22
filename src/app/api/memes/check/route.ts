import { NextResponse } from "next/server";
import { getMeme } from "@/lib/data";
import { findNumeraire } from "@/lib/numeraire";
import { mojiHref } from "@/lib/hrefs";
import { validateMemeName, validateMemeSymbol } from "@/lib/memecoin";

export const dynamic = "force-dynamic";

/**
 * GET /api/memes/check?symbol=PEPE&name=Pepe&chainId=4663&pair=0x…|AAPL
 * One ticker per pair per chain. → { valid, symbol, reason?, claimed, needsPair?, owner?: { display, href } }
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const chainId = Number(q.get("chainId") ?? 0);
  const pairParam = q.get("pair") ?? "";
  const pair = (chainId && findNumeraire(chainId, pairParam)?.address) || pairParam;
  const sy = validateMemeSymbol(q.get("symbol") ?? "");
  if (!sy.ok) return NextResponse.json({ valid: false, reason: sy.reason, claimed: false });
  if (q.has("name")) {
    const n = validateMemeName(q.get("name") ?? "");
    if (!n.ok) return NextResponse.json({ valid: false, symbol: sy.symbol, reason: n.reason, claimed: false });
  }
  if (!chainId || !/^0x[0-9a-fA-F]{40}$/.test(pair)) return NextResponse.json({ valid: true, symbol: sy.symbol, claimed: false, needsPair: true });
  const m = await getMeme(sy.symbol, pair, chainId);
  return NextResponse.json({ valid: true, symbol: sy.symbol, claimed: Boolean(m), owner: m ? { display: `${m.display} / ${m.stock_ticker}`, href: mojiHref(m) } : undefined });
}
