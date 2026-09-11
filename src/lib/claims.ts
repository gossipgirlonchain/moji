import "server-only";
import { decodeEventLog, erc20Abi, formatUnits, type Address, type Hex } from "viem";
import { chainById } from "@/config/chains";
import { findStock } from "@/config/stocks";
import { publicClientFor } from "./rpc";
import { stockPriceServer } from "./market";
import type { MojiRow } from "./supabase";

export type ClaimSummary = {
  beneficiary: Address;
  stockAmount: number;
  mojiAmount: number;
  stockUsd: number;
  mojiUsd: number;
  txHashes: Hex[];
};

async function mojiPriceUsd(m: MojiRow): Promise<number> {
  if (!m.token_address) return 0;
  const chain = chainById(m.chain_id);
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain?.dexscreenerSlug ?? "robinhood"}/${m.token_address}`, { next: { revalidate: 60 } });
    const pairs = (await r.json()) as { priceUsd?: string }[];
    return Number(pairs?.[0]?.priceUsd ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Authoritative claim accounting: read the tx receipts and sum every ERC-20 Transfer of the stock
 * token and the moji token that landed in the beneficiary's wallet. Nothing from the client is trusted
 * except the tx hashes, and the receipts' `from` must be the beneficiary.
 */
export async function summarizeClaim(m: MojiRow, txHashes: Hex[], expectedBeneficiary?: Address): Promise<ClaimSummary | null> {
  const chain = chainById(m.chain_id);
  if (!chain?.viem || !m.token_address) return null;
  const pc = publicClientFor(chain.viem);
  const stock = findStock(m.chain_id, m.stock_address);
  const stockDecimals = stock?.decimals ?? 18;
  const token = m.token_address.toLowerCase();
  const stockAddr = m.stock_address.toLowerCase();

  let beneficiary: Address | null = null;
  let stockWei = 0n;
  let mojiWei = 0n;
  for (const h of txHashes) {
    const receipt = await pc.getTransactionReceipt({ hash: h }).catch(() => null);
    if (!receipt || receipt.status !== "success") continue;
    const from = receipt.from as Address;
    if (expectedBeneficiary && from.toLowerCase() !== expectedBeneficiary.toLowerCase()) continue;
    beneficiary = beneficiary ?? from;
    for (const log of receipt.logs) {
      const a = log.address.toLowerCase();
      if (a !== token && a !== stockAddr) continue;
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Transfer") continue;
        const { to, value } = ev.args as { to: Address; value: bigint };
        if (to.toLowerCase() !== from.toLowerCase()) continue;
        if (a === token) mojiWei += value;
        else stockWei += value;
      } catch {}
    }
  }
  if (!beneficiary) return null;
  const stockAmount = Number(formatUnits(stockWei, stockDecimals));
  const mojiAmount = Number(formatUnits(mojiWei, 18));
  const [stockPrice, mojiPrice] = await Promise.all([stockPriceServer(m.chain_id, m.stock_address), mojiPriceUsd(m)]);
  return { beneficiary, stockAmount, mojiAmount, stockUsd: stockAmount * stockPrice, mojiUsd: mojiAmount * mojiPrice, txHashes };
}
