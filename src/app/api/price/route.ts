import { NextResponse } from "next/server";
import { dexscreenerPriceUsd, nativePriceUsd, yahooPrice } from "@/lib/market";

export const dynamic = "force-dynamic";

/** Proxy for Robinhood's public stock-token price endpoint (docs.robinhood.com/chain/stock-token-apis). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").toUpperCase();
  const chain = url.searchParams.get("chain");
  const address = url.searchParams.get("address");
  if (chain && address && /^[a-z]+$/.test(chain) && /^0x[0-9a-fA-F]{40}$/.test(address)) {
    const p = await dexscreenerPriceUsd(chain, address);
    return p > 0 ? NextResponse.json({ ticker, price: p, source: "dexscreener" }) : NextResponse.json({ error: "no price" }, { status: 502 });
  }
  if (!/^[A-Z0-9.]{1,12}$/.test(ticker)) return NextResponse.json({ error: "bad ticker" }, { status: 400 });
  if (ticker === "ETH" || ticker === "MON") {
    const p = await nativePriceUsd(ticker);
    return p > 0 ? NextResponse.json({ ticker, price: p, source: "doppler-indexer" }) : NextResponse.json({ error: "no price" }, { status: 502 });
  }
  const fallback = async () => {
    const p = await yahooPrice(ticker);
    return p > 0 ? NextResponse.json({ ticker, price: p, source: "yahoo" }) : NextResponse.json({ error: "no price" }, { status: 502 });
  };
  try {
    const r = await fetch(`https://api.robinhood.com/rhj/prices/${ticker}`, {
      headers: { "user-agent": "moji.wtf" },
      next: { revalidate: 15 },
    });
    if (!r.ok) return fallback();
    const raw = (await r.json()) as { quotes?: Record<string, unknown>[] } & Record<string, unknown>;
    const j = (raw.quotes?.[0] ?? raw) as Record<string, unknown>; // Robinhood nests under quotes[0]
    const pick = (k: string) => Number(j[k] ?? NaN);
    const bid = pick("bid") || pick("bidPrice");
    const ask = pick("ask") || pick("askPrice");
    const price = isFinite(bid) && isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : pick("price") || pick("lastPrice");
    if (!isFinite(price) || price <= 0) return fallback();
    return NextResponse.json({ ticker, price, source: "robinhood" });
  } catch {
    return fallback();
  }
}
