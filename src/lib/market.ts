import "server-only";
import { formatUnits } from "viem";
import { publicClientFor } from "./rpc";
import { chainById } from "@/config/chains";
import { findStock } from "@/config/stocks";
import { wethNumeraire } from "./numeraire";
import type { MojiRow } from "./supabase";

export const INDEXER = process.env.DOPPLER_INDEXER_URL ?? "https://prod.indexer.doppler.lol/graphql";

export type Market = {
  priceUsd: number;
  marketCapUsd: number;
  stockPriceUsd: number;
  volume24Usd: number;
  txns24: number;
  liquidityUsd: number;
  live: boolean;
};

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(INDEXER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: T };
    return j.data ?? null;
  } catch {
    return null;
  }
}

/** ETH (or MON) in USD from the Doppler indexer, which sources it from Chainlink (docs: "eth_price"). */
export async function nativePriceUsd(symbol: "ETH" | "MON"): Promise<number> {
  const field = symbol === "MON" ? "monadUsdcPrices" : "ethPrices";
  const data = await gql<Record<string, { items: { price: string }[] }>>(`{ ${field}(limit: 1, orderBy: "timestamp", orderDirection: "desc") { items { price } } }`, {});
  const raw = data?.[field]?.items?.[0]?.price;
  if (!raw) return 0;
  // ethPrices is Chainlink 8-decimal; monadUsdcPrices is an 18-decimal USDC quote (verified against Dexscreener WMON).
  return Number(formatUnits(BigInt(raw), symbol === "MON" ? 18 : 8));
}

/** Server-side numeraire price: WETH chains → Doppler indexer; stocks → Chainlink feed, Robinhood API, Yahoo. */
export async function stockPriceServer(chainId: number, stockAddress: string, tickerHint?: string): Promise<number> {
  const chain = chainById(chainId);
  const w = chain ? wethNumeraire(chain) : null;
  if (w && w.address.toLowerCase() === stockAddress.toLowerCase()) return nativePriceUsd(chain!.gasSymbol === "MON" ? "MON" : "ETH");
  const stock = findStock(chainId, stockAddress) ?? (tickerHint ? { ticker: tickerHint, chainlinkFeed: undefined } : undefined);
  if (stock?.chainlinkFeed && chain?.viem) {
    try {
      const pc = publicClientFor(chain.viem);
      const abi = [
        { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
        { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
      ] as const;
      const [round, dec] = await Promise.all([
        pc.readContract({ address: stock.chainlinkFeed, abi, functionName: "latestRoundData" }),
        pc.readContract({ address: stock.chainlinkFeed, abi, functionName: "decimals" }),
      ]);
      const p = Number(round[1]) / 10 ** Number(dec);
      if (p > 0) return p;
    } catch {}
  }
  if (stock) {
    try {
      const r = await fetch(`https://api.robinhood.com/rhj/prices/${stock.ticker}`, { headers: { "user-agent": "moji.wtf" }, next: { revalidate: 30 } });
      if (r.ok) {
        const raw = (await r.json()) as { quotes?: Record<string, unknown>[] } & Record<string, unknown>;
        const j = (raw.quotes?.[0] ?? raw) as Record<string, unknown>; // Robinhood nests under quotes[0]
        const n = (k: string) => Number(j[k] ?? NaN);
        const mid = (n("bid") + n("ask")) / 2;
        if (isFinite(mid) && mid > 0) return mid;
        if (isFinite(n("price")) && n("price") > 0) return n("price");
      }
    } catch {}
  }
  // Any US ticker: Yahoo's chart endpoint, no key.
  if (stock) {
    const y = await yahooPrice(stock.ticker);
    if (y > 0) return y;
  }
  return 0;
}

/** Last regular-market price from Yahoo Finance for any US ticker (BRK.B → BRK-B). */
export async function yahooPrice(ticker: string): Promise<number> {
  try {
    const sym = ticker.replace(".", "-");
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, { headers: { "user-agent": "Mozilla/5.0 moji.wtf" }, next: { revalidate: 60 } });
    if (!r.ok) return 0;
    const j = (await r.json()) as { chart?: { result?: { meta?: { regularMarketPrice?: number; previousClose?: number } }[] } };
    const m = j.chart?.result?.[0]?.meta;
    const p = Number(m?.regularMarketPrice ?? m?.previousClose ?? 0);
    return isFinite(p) && p > 0 ? p : 0;
  } catch {
    return 0;
  }
}

type IndexerToken = {
  token: {
    totalSupply: string;
    pool: { address: string; price: string; marketCapUsd: string; totalFee0: string; totalFee1: string; isToken0: boolean; quoteToken?: { symbol: string } } | null;
  } | null;
};

/**
 * Live price + market cap for a moji. Dexscreener prices stock-quoted pairs correctly; the Doppler
 * indexer's USD fields assume an ETH quote, so it is only used for the raw numeraire price as a fallback.
 * Falls back to the stored Supabase market cap when the token has no on-chain data yet.
 */
export async function getMarket(m: MojiRow): Promise<Market> {
  const fallback: Market = { priceUsd: 0, marketCapUsd: Number(m.market_cap_usd ?? 0), stockPriceUsd: 0, volume24Usd: 0, txns24: 0, liquidityUsd: 0, live: false };
  if (!m.token_address) return fallback;
  const chain = chainById(m.chain_id);
  if (!chain?.viem) return fallback;

  const stockPrice = await stockPriceServer(m.chain_id, m.stock_address, m.stock_ticker);
  const supply = Number(m.supply ?? 0);
  const isWeth = wethNumeraire(chain)?.address.toLowerCase() === m.stock_address.toLowerCase();

  let priceUsd = 0;
  let marketCapUsd = 0;
  let volume24Usd = 0;
  let txns24 = 0;
  let liquidityUsd = 0;
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain.dexscreenerSlug}/${m.token_address}`, { next: { revalidate: 30 } });
    if (r.ok) {
      const pairs = (await r.json()) as { priceUsd?: string; marketCap?: number; fdv?: number; volume?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } }; liquidity?: { usd?: number } }[];
      const p = pairs?.[0];
      if (p) {
        priceUsd = Number(p.priceUsd ?? 0);
        marketCapUsd = Number(p.marketCap ?? p.fdv ?? 0) || priceUsd * supply;
        volume24Usd = Number(p.volume?.h24 ?? 0);
        txns24 = Number(p.txns?.h24?.buys ?? 0) + Number(p.txns?.h24?.sells ?? 0);
        liquidityUsd = Number(p.liquidity?.usd ?? 0);
      }
    }
  } catch {}

  if (isWeth) {
    const data = await gql<IndexerToken>(
      `query T($address: String!, $chainId: BigInt!) { token(address: $address, chainId: $chainId) { totalSupply pool { address price marketCapUsd totalFee0 totalFee1 isToken0 } } }`,
      { address: m.token_address.toLowerCase(), chainId: String(m.chain_id) },
    );
    const pool = data?.token?.pool ?? null;
    if (pool) {
      const mc = Number(pool.marketCapUsd ?? 0);
      const p = Number(pool.price ?? 0) * stockPrice;
      if (p > 0) priceUsd = p;
      if (mc > 0) marketCapUsd = mc;
      else if (p > 0) marketCapUsd = p * supply;
    }
  }

  if (!priceUsd && stockPrice) {
    const data = await gql<IndexerToken>(
      `query T($address: String!, $chainId: BigInt!) { token(address: $address, chainId: $chainId) { totalSupply pool { address price marketCapUsd totalFee0 totalFee1 isToken0 } } }`,
      { address: m.token_address.toLowerCase(), chainId: String(m.chain_id) },
    );
    const pool = data?.token?.pool ?? null;
    if (pool) {
      priceUsd = Number(pool.price) * stockPrice;
      marketCapUsd = priceUsd * supply;
    }
  }

  return { priceUsd, marketCapUsd: marketCapUsd || fallback.marketCapUsd, stockPriceUsd: stockPrice, volume24Usd, txns24, liquidityUsd, live: Boolean(priceUsd) };
}

export type Point = { time: number; value: number };

/** Price history from indexer swaps (price = numeraire per token × stock USD). */
export async function getPriceSeries(m: MojiRow, range: "1H" | "4H" | "1D" | "7D" | "ALL"): Promise<Point[]> {
  if (!m.token_address || !m.pool_id) return [];
  const since = { "1H": 3600, "4H": 4 * 3600, "1D": 86400, "7D": 7 * 86400, ALL: 0 }[range];
  const stockPrice = await stockPriceServer(m.chain_id, m.stock_address);
  type Swap = { timestamp: string; type: string; amountIn: string; amountOut: string };
  const data = await gql<{ swaps: { items: Swap[] } }>(
    `query S($pool: String!) { swaps(where: { pool: $pool }, orderBy: "timestamp", orderDirection: "desc", limit: 1000) { items { timestamp type amountIn amountOut } } }`,
    { pool: m.pool_id.toLowerCase() },
  );
  const items = data?.swaps?.items ?? [];
  const cutoff = since ? Math.floor(Date.now() / 1000) - since : 0;
  const pts: Point[] = [];
  for (const s of items) {
    const t = Number(s.timestamp);
    if (t < cutoff) continue;
    const inn = Number(formatUnits(BigInt(s.amountIn), 18));
    const out = Number(formatUnits(BigInt(s.amountOut), 18));
    if (!inn || !out) continue;
    const isBuy = s.type?.toLowerCase() === "buy";
    const priceInNumeraire = isBuy ? inn / out : out / inn;
    pts.push({ time: t, value: priceInNumeraire * stockPrice });
  }
  pts.sort((a, b) => a.time - b.time);
  // dedupe identical timestamps (lightweight-charts requires strictly ascending)
  return pts.filter((p, i) => i === 0 || p.time > pts[i - 1].time);
}
