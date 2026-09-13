import { createPublicClient, parseAbi } from "viem";
import { transportFor } from "@/lib/rpc";
import type { Stock } from "@/config/stocks";
import { robinhoodChain } from "@/config/chains";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

/**
 * USD price of one stock token. Chainlink feed on Robinhood Chain when available,
 * else Robinhood's public price API via our proxy route.
 */
export async function stockPriceUsd(stock: Stock): Promise<number> {
  if (stock.priceSource === "dexscreener" && stock.dexChain) {
    const r = await fetch(`/api/price?ticker=${encodeURIComponent(stock.ticker)}&chain=${stock.dexChain}&address=${stock.address}`, { cache: "no-store" });
    if (!r.ok) throw new Error("No price for " + stock.ticker);
    return ((await r.json()) as { price: number }).price;
  }
  if (stock.chainlinkFeed) {
    try {
      const pc = createPublicClient({ chain: robinhoodChain, transport: transportFor(robinhoodChain) });
      const [round, dec] = await Promise.all([
        pc.readContract({ address: stock.chainlinkFeed, abi: feedAbi, functionName: "latestRoundData" }),
        pc.readContract({ address: stock.chainlinkFeed, abi: feedAbi, functionName: "decimals" }),
      ]);
      const p = Number(round[1]) / 10 ** Number(dec);
      if (p > 0) return p;
    } catch {}
  }
  const r = await fetch(`/api/price?ticker=${encodeURIComponent(stock.ticker)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("No price for " + stock.ticker);
  const j = (await r.json()) as { price: number };
  return j.price;
}
