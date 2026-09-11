import "server-only";
import { createPublicClient, http, formatUnits } from "viem";
import { chainById } from "@/config/chains";
import { findStock } from "@/config/stocks";
import type { MojiRow } from "./supabase";

export const INDEXER = process.env.DOPPLER_INDEXER_URL ?? "https://prod.indexer.doppler.lol/graphql";

export type Market = {
  priceUsd: number;
  marketCapUsd: number;
  stockPriceUsd: number;
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

/** Server-side stock price: Chainlink feed when present, else Robinhood public price API. */
export async function stockPriceServer(chainId: number, stockAddress: string): Promise<number> {
  const stock = findStock(chainId, stockAddress);
  const chain = chainById(chainId);
  if (stock?.chainlinkFeed && chain?.viem) {
    try {
      const pc = createPublicClient({ chain: chain.viem, transport: http() });
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
        const j = (await r.json()) as Record<string, unknown>;
        const n = (k: string) => Number(j[k] ?? NaN);
        const mid = (n("bid") + n("ask")) / 2;
        if (isFinite(mid) && mid > 0) return mid;
        if (isFinite(n("price")) && n("price") > 0) return n("price");
      }
    } catch {}
  }
  return 0;
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
  const fallback: Market = { priceUsd: 0, marketCapUsd: Number(m.market_cap_usd ?? 0), stockPriceUsd: 0, live: false };
  if (!m.token_address) return fallback;
  const chain = chainById(m.chain_id);
  if (!chain?.viem) return fallback;

  const stockPrice = await stockPriceServer(m.chain_id, m.stock_address);
  const supply = Number(m.supply ?? 0);

  let priceUsd = 0;
  let marketCapUsd = 0;
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain.dexscreenerSlug}/${m.token_address}`, { next: { revalidate: 30 } });
    if (r.ok) {
      const pairs = (await r.json()) as { priceUsd?: string; marketCap?: number; fdv?: number }[];
      const p = pairs?.[0];
      if (p) {
        priceUsd = Number(p.priceUsd ?? 0);
        marketCapUsd = Number(p.marketCap ?? p.fdv ?? 0) || priceUsd * supply;
      }
    }
  } catch {}

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

  return { priceUsd, marketCapUsd: marketCapUsd || fallback.marketCapUsd, stockPriceUsd: stockPrice, live: Boolean(priceUsd) };
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
