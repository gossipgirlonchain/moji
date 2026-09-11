import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Proxy for Robinhood's public stock-token price endpoint (docs.robinhood.com/chain/stock-token-apis). */
export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker") ?? "";
  if (!/^[A-Z.]{1,8}$/.test(ticker)) return NextResponse.json({ error: "bad ticker" }, { status: 400 });
  try {
    const r = await fetch(`https://api.robinhood.com/rhj/prices/${ticker}`, {
      headers: { "user-agent": "moji.wtf" },
      next: { revalidate: 15 },
    });
    if (!r.ok) return NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    const raw = (await r.json()) as { quotes?: Record<string, unknown>[] } & Record<string, unknown>;
    const j = (raw.quotes?.[0] ?? raw) as Record<string, unknown>; // Robinhood nests under quotes[0]
    const pick = (k: string) => Number(j[k] ?? NaN);
    const bid = pick("bid") || pick("bidPrice");
    const ask = pick("ask") || pick("askPrice");
    const price = isFinite(bid) && isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : pick("price") || pick("lastPrice");
    if (!isFinite(price) || price <= 0) return NextResponse.json({ error: "no price", raw: j }, { status: 502 });
    return NextResponse.json({ ticker, price });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
