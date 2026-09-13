import "server-only";
import { formatUnits, parseAbiItem, type Address } from "viem";
import { getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { chainById } from "@/config/chains";
import { MOJI_TREASURY } from "@/config/fees";
import { findNumeraire } from "./numeraire";
import { publicClientFor } from "./rpc";
import type { MojiRow } from "./supabase";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const OWNER_ABI = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

/** Largest eth_getLogs block range each public RPC accepts. Halved on the fly when a node complains. */
const CHUNK: Record<number, bigint> = { 4663: 500_000n, 8453: 2_000n, 1: 2_000n, 143: 2_000n };

export type ClaimScan = {
  /** whole-token amounts paid out to every beneficiary in the scanned range */
  stock: number;
  moji: number;
  creatorStock: number;
  creatorMoji: number;
  count: number;
  scannedBlock: bigint;
  /** true when the scan reached the chain head; false when it stopped at maxChunks */
  complete: boolean;
};

/** Doppler contracts that pay fees out: the initializer (locked positions) and the Rehype hook (swap fees). */
function payers(chainId: number): Address[] {
  const a = getAddresses(chainId) as unknown as Record<string, Address | undefined>;
  return [a.dopplerHookInitializer, a.v4MulticurveInitializer, a.rehypeDopplerHookInitializer].filter((x): x is Address => Boolean(x));
}

const ownerCache = new Map<number, Address>();
async function protocolOwner(chainId: number): Promise<Address | null> {
  const hit = ownerCache.get(chainId);
  if (hit) return hit;
  const chain = chainById(chainId);
  if (!chain?.viem) return null;
  try {
    const owner = await publicClientFor(chain.viem).readContract({ address: getAddresses(chainId).airlock, abi: OWNER_ABI, functionName: "owner" });
    ownerCache.set(chainId, owner);
    return owner;
  } catch {
    return null;
  }
}

/**
 * Authoritative claimed-fee accounting: every ERC-20 Transfer of the stock token or the moji token
 * from a Doppler fee contract to one of the pool's beneficiaries (creator, treasury, protocol owner).
 * Incremental: starts after `fees_scanned_block` (or at the launch block) and walks to the chain head.
 * Returns null when the moji cannot be scanned (no token, no launch tx, unsupported chain).
 */
export async function scanClaims(m: MojiRow, opts: { maxChunks?: number } = {}): Promise<ClaimScan | null> {
  const chain = chainById(m.chain_id);
  if (!chain?.viem || !m.token_address) return null;
  const pc = publicClientFor(chain.viem);
  const zero = (scannedBlock: bigint, complete = true): ClaimScan => ({ stock: 0, moji: 0, creatorStock: 0, creatorMoji: 0, count: 0, scannedBlock, complete });

  let from: bigint;
  if (m.fees_scanned_block != null) from = BigInt(m.fees_scanned_block) + 1n;
  else if (m.tx_hash) {
    const receipt = await pc.getTransactionReceipt({ hash: m.tx_hash as `0x${string}` }).catch(() => null);
    if (!receipt) return null;
    from = receipt.blockNumber;
  } else return null;

  const head = await pc.getBlockNumber();
  if (from > head) return zero(BigInt(m.fees_scanned_block ?? 0));

  const owner = await protocolOwner(m.chain_id);
  const beneficiaries = [m.creator_address, MOJI_TREASURY, owner].filter((x): x is Address => Boolean(x)) as Address[];
  const creator = m.creator_address?.toLowerCase();
  const token = m.token_address.toLowerCase();
  const stockDecimals = findNumeraire(m.chain_id, m.stock_address)?.decimals ?? 18;

  let chunk = CHUNK[m.chain_id] ?? 2_000n;
  const maxChunks = opts.maxChunks ?? 20;
  let chunks = 0;
  let stockWei = 0n;
  let mojiWei = 0n;
  let creatorStockWei = 0n;
  let creatorMojiWei = 0n;
  let count = 0;
  let cursor = from;
  while (cursor <= head && chunks < maxChunks) {
    const to = cursor + chunk - 1n > head ? head : cursor + chunk - 1n;
    let logs;
    try {
      logs = await pc.getLogs({ address: [m.token_address as Address, m.stock_address as Address], event: TRANSFER, args: { from: payers(m.chain_id), to: beneficiaries }, fromBlock: cursor, toBlock: to });
    } catch (e) {
      const msg = String((e as { details?: string }).details ?? e).toLowerCase();
      if (chunk > 500n && /range|limit|too many|exceed|block/.test(msg)) {
        chunk /= 2n;
        continue;
      }
      throw e;
    }
    for (const l of logs) {
      const v = l.args.value as bigint;
      const isMoji = l.address.toLowerCase() === token;
      const toCreator = creator != null && (l.args.to as string).toLowerCase() === creator;
      if (isMoji) {
        mojiWei += v;
        if (toCreator) creatorMojiWei += v;
      } else {
        stockWei += v;
        if (toCreator) creatorStockWei += v;
      }
      count++;
    }
    cursor = to + 1n;
    chunks++;
  }
  return {
    stock: Number(formatUnits(stockWei, stockDecimals)),
    moji: Number(formatUnits(mojiWei, 18)),
    creatorStock: Number(formatUnits(creatorStockWei, stockDecimals)),
    creatorMoji: Number(formatUnits(creatorMojiWei, 18)),
    count,
    scannedBlock: cursor - 1n,
    complete: cursor > head,
  };
}

/**
 * The mojis-row patch that folds a scan into the stored running totals and revalues claimed USD at current prices.
 * `fees_claimed_usd` is the CREATOR's claimed share only, so it lines up with `fees_unclaimed_usd` (creator pending):
 * everything shown as "fees" / "earned" is what the launcher gets. Treasury and protocol claims stay in the totals.
 */
export function claimPatch(m: MojiRow, scan: ClaimScan, prices: { stockUsd: number; mojiUsd: number }): Record<string, unknown> {
  const creatorStock = Number(m.fees_creator_stock_claimed ?? 0) + scan.creatorStock;
  const creatorMoji = Number(m.fees_creator_moji_claimed ?? 0) + scan.creatorMoji;
  return {
    fees_stock_claimed: Number(m.fees_stock_claimed ?? 0) + scan.stock,
    fees_moji_claimed: Number(m.fees_moji_claimed ?? 0) + scan.moji,
    fees_creator_stock_claimed: creatorStock,
    fees_creator_moji_claimed: creatorMoji,
    fees_claim_count: Number(m.fees_claim_count ?? 0) + scan.count,
    fees_scanned_block: scan.scannedBlock.toString(),
    fees_claimed_usd: creatorStock * prices.stockUsd + creatorMoji * prices.mojiUsd,
  };
}
