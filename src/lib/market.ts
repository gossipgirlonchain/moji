import "server-only";
import { formatUnits } from "viem";
import { getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { publicClientFor } from "./rpc";
import { chainById } from "@/config/chains";
import { findStock } from "@/config/stocks";
import { findNumeraire, wethNumeraire } from "./numeraire";
import type { MojiRow } from "./supabase";

export const INDEXER = process.env.DOPPLER_INDEXER_URL ?? "https://prod.indexer.doppler.lol/graphql";

export type Market = {
  priceUsd: number;
  marketCapUsd: number;
  stockPriceUsd: number;
  volume24Usd: number;
  volume6hUsd: number;
  volume1hUsd: number;
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

export type NativeSymbol = "ETH" | "MON" | "BNB";

/**
 * Native gas token in USD. ETH and MON come from the Doppler indexer, which sources them from Chainlink
 * (docs: "eth_price"). BNB has no indexer price field, so it is WBNB's most liquid Dexscreener pair.
 */
export async function nativePriceUsd(symbol: NativeSymbol): Promise<number> {
  if (symbol === "BNB") return dexscreenerPriceUsd("bsc", getAddresses(56).weth);
  const field = symbol === "MON" ? "monadUsdcPrices" : "ethPrices";
  const data = await gql<Record<string, { items: { price: string }[] }>>(`{ ${field}(limit: 1, orderBy: "timestamp", orderDirection: "desc") { items { price } } }`, {});
  const raw = data?.[field]?.items?.[0]?.price;
  if (!raw) return 0;
  // ethPrices is Chainlink 8-decimal; monadUsdcPrices is an 18-decimal USDC quote (verified against Dexscreener WMON).
  return Number(formatUnits(BigInt(raw), symbol === "MON" ? 18 : 8));
}

/** Gas symbol → the native price source key. Anything unknown is priced like ETH. */
export function nativeSymbol(gasSymbol: string): NativeSymbol {
  return gasSymbol === "MON" || gasSymbol === "BNB" ? gasSymbol : "ETH";
}

/** Spot USD price of a token from its most liquid real pair on Dexscreener (pairs under $1K/24h volume ignored). */
export async function dexscreenerPriceUsd(dexChain: string, address: string): Promise<number> {
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${dexChain}/${address}`, { next: { revalidate: 30 } });
    if (!r.ok) return 0;
    const pairs = (await r.json()) as { priceUsd?: string; liquidity?: { usd?: number }; volume?: { h24?: number }; baseToken?: { address?: string } }[];
    const real = pairs.filter((p) => Number(p.volume?.h24 ?? 0) > 1000 && p.baseToken?.address?.toLowerCase() === address.toLowerCase()).sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0));
    return Number(real[0]?.priceUsd ?? pairs[0]?.priceUsd ?? 0);
  } catch {
    return 0;
  }
}

/** Server-side numeraire price: WETH → Doppler indexer; curated tokens → Dexscreener; stocks → Chainlink feed, Robinhood API, Yahoo. */
export async function stockPriceServer(chainId: number, stockAddress: string, tickerHint?: string): Promise<number> {
  const chain = chainById(chainId);
  const w = chain ? wethNumeraire(chain) : null;
  if (w && w.address.toLowerCase() === stockAddress.toLowerCase()) return nativePriceUsd(nativeSymbol(chain!.gasSymbol));
  const numeraire = findNumeraire(chainId, stockAddress);
  if (numeraire?.priceSource === "dexscreener" && numeraire.dexChain) return dexscreenerPriceUsd(numeraire.dexChain, numeraire.address);
  const stock = findStock(chainId, stockAddress) ?? numeraire ?? (tickerHint ? { ticker: tickerHint, chainlinkFeed: undefined } : undefined);
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
  const fallback: Market = { priceUsd: 0, marketCapUsd: Number(m.market_cap_usd ?? 0), stockPriceUsd: 0, volume24Usd: 0, volume6hUsd: 0, volume1hUsd: 0, txns24: 0, liquidityUsd: 0, live: false };
  if (!m.token_address) return fallback;
  const chain = chainById(m.chain_id);
  if (!chain?.viem) return fallback;

  const stockPrice = await stockPriceServer(m.chain_id, m.stock_address, m.stock_ticker);
  const supply = Number(m.supply ?? 0);
  const isWeth = wethNumeraire(chain)?.address.toLowerCase() === m.stock_address.toLowerCase();

  let priceUsd = 0;
  let marketCapUsd = 0;
  let volume24Usd = 0;
  let volume6hUsd = 0;
  let volume1hUsd = 0;
  let txns24 = 0;
  let liquidityUsd = 0;
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain.dexscreenerSlug}/${m.token_address}`, { next: { revalidate: 30 } });
    if (r.ok) {
      const pairs = (await r.json()) as { priceUsd?: string; marketCap?: number; fdv?: number; volume?: { h24?: number; h6?: number; h1?: number }; txns?: { h24?: { buys?: number; sells?: number } }; liquidity?: { usd?: number } }[];
      const p = pairs?.[0];
      if (p) {
        priceUsd = Number(p.priceUsd ?? 0);
        marketCapUsd = Number(p.marketCap ?? p.fdv ?? 0) || priceUsd * supply;
        volume24Usd = Number(p.volume?.h24 ?? 0);
        volume6hUsd = Number(p.volume?.h6 ?? 0);
        volume1hUsd = Number(p.volume?.h1 ?? 0);
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

  return { priceUsd, marketCapUsd: marketCapUsd || fallback.marketCapUsd, stockPriceUsd: stockPrice, volume24Usd, volume6hUsd, volume1hUsd, txns24, liquidityUsd, live: Boolean(priceUsd) };
}

/**
 * Volume and trade counts over 7d / 30d / all time for a pool, from the Doppler indexer's swap history
 * (swapValueUsd, 18-decimal USD). Paginates newest-first with the indexer's cursor; capped at 20k swaps.
 */
export type WindowedVolume = { all: number; d7: number; d30: number; txnsAll: number; txns7: number; txns30: number };
export async function windowedVolume(m: MojiRow): Promise<WindowedVolume | null> {
  if (!m.pool_id) return null;
  type Page = { swaps: { items: { swapValueUsd: string; timestamp: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
  const now = Math.floor(Date.now() / 1000);
  const t7 = now - 7 * 86400;
  const t30 = now - 30 * 86400;
  const out: WindowedVolume = { all: 0, d7: 0, d30: 0, txnsAll: 0, txns7: 0, txns30: 0 };
  let after: string | null = null as string | null;
  for (let page = 0; page < 20; page++) {
    const data: Page | null = await gql<Page>(
      `query S($pool: String!, $after: String) { swaps(where: { pool: $pool }, orderBy: "timestamp", orderDirection: "desc", limit: 1000, after: $after) { items { swapValueUsd timestamp } pageInfo { hasNextPage endCursor } } }`,
      { pool: m.pool_id.toLowerCase(), after },
    );
    const sw: Page["swaps"] | undefined = data?.swaps;
    if (!sw) return page === 0 ? null : out;
    for (const it of sw.items) {
      const v = Number(formatUnits(BigInt(it.swapValueUsd ?? "0"), 18));
      const t = Number(it.timestamp);
      out.all += v;
      out.txnsAll++;
      if (t >= t30) {
        out.d30 += v;
        out.txns30++;
      }
      if (t >= t7) {
        out.d7 += v;
        out.txns7++;
      }
    }
    if (!sw.pageInfo.hasNextPage || !sw.pageInfo.endCursor) break;
    after = sw.pageInfo.endCursor;
  }
  return out;
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

export type StockStats = { price: number; changePct: number; volumeUsd: number; marketCapUsd: number };

async function yahooMeta(ticker: string): Promise<{ price: number; prevClose: number; volume: number } | null> {
  try {
    const sym = ticker.replace(".", "-");
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, { headers: { "user-agent": "Mozilla/5.0 moji.wtf" }, next: { revalidate: 300 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { chart?: { result?: { meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number; regularMarketVolume?: number }; indicators?: { quote?: { volume?: (number | null)[] }[] } }[] } };
    const res = j.chart?.result?.[0];
    const m = res?.meta;
    const vol = Number(m?.regularMarketVolume ?? res?.indicators?.quote?.[0]?.volume?.at(-1) ?? 0);
    return { price: Number(m?.regularMarketPrice ?? 0), prevClose: Number(m?.chartPreviousClose ?? m?.previousClose ?? 0), volume: isFinite(vol) ? vol : 0 };
  } catch {
    return null;
  }
}

async function robinhoodFundamentals(ticker: string): Promise<{ marketCap: number; volume: number } | null> {
  try {
    const r = await fetch(`https://api.robinhood.com/fundamentals/${encodeURIComponent(ticker)}/`, { headers: { "user-agent": "moji.wtf" }, next: { revalidate: 600 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { market_cap?: string | number; volume?: string | number };
    const mc = Number(j.market_cap ?? 0);
    const v = Number(j.volume ?? 0);
    return { marketCap: isFinite(mc) ? mc : 0, volume: isFinite(v) ? v : 0 };
  } catch {
    return null;
  }
}

/**
 * Price plus the real-world numbers behind a pair: 24h change, 24h dollar volume and market cap.
 * Equities come from Robinhood fundamentals and Yahoo; tokens (WETH, curated tokens) only get a price.
 * Every field degrades to 0 so a slow provider never blocks a page.
 */
export async function stockStatsServer(chainId: number, stockAddress: string, tickerHint?: string): Promise<StockStats> {
  const chain = chainById(chainId);
  const w = chain ? wethNumeraire(chain) : null;
  const isNative = !!w && w.address.toLowerCase() === stockAddress.toLowerCase();
  const numeraire = findNumeraire(chainId, stockAddress);
  const isToken = numeraire?.priceSource === "dexscreener";
  const ticker = findStock(chainId, stockAddress)?.ticker ?? numeraire?.ticker ?? tickerHint;
  const equity = !isNative && !isToken && !!ticker;
  const [price, y, rh] = await Promise.all([
    stockPriceServer(chainId, stockAddress, tickerHint).catch(() => 0),
    equity ? yahooMeta(ticker!) : Promise.resolve(null),
    equity ? robinhoodFundamentals(ticker!) : Promise.resolve(null),
  ]);
  const changePct = y && y.prevClose > 0 && y.price > 0 ? ((y.price - y.prevClose) / y.prevClose) * 100 : 0;
  const shares = rh?.volume || y?.volume || 0;
  return { price, changePct, volumeUsd: shares * (price || y?.price || 0), marketCapUsd: rh?.marketCap ?? 0 };
}
