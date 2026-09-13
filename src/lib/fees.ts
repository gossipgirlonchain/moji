import "server-only";
import { formatUnits, type Address, type Hex } from "viem";
import { publicClientFor } from "./rpc";
import { DopplerSDK, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { chainById } from "@/config/chains";
import { findNumeraire } from "./numeraire";
import { currentFee } from "@/config/fees";
import type { MojiRow } from "./supabase";

export type FeeAmounts = {
  /** stock (numeraire) token amount, whole units */
  stock: number;
  /** moji (asset) token amount, whole units */
  moji: number;
};

export type FeeSchedule = {
  startFee: number;
  endFee: number;
  currentFee: number;
  startingTime: number;
  durationSeconds: number;
  decaying: boolean;
};

export type MojiFees = {
  pending: FeeAmounts;
  /** creator's claimed amounts so far, from the chain scan (whole tokens) */
  claimed: FeeAmounts;
  /** USD split: what the stock-token side is worth vs the moji-token side */
  pendingStockUsd: number;
  pendingMojiUsd: number;
  /** raw pending split by source, so the Claim button knows which calls to make */
  sources: { pool: boolean; hook: boolean };
  /** per-source amounts (whole tokens), so the UI can say what each transaction pays */
  bySource: { pool: FeeAmounts; hook: FeeAmounts };
  pendingUsd: number;
  claimedUsd: number;
  earnedUsd: number;
  schedule: FeeSchedule | null;
  /** true when the numbers came from chain, false when they are the stored fallback */
  live: boolean;
  /** set when a chain read failed; the numbers are not trustworthy */
  error?: string;
  assetIsToken0: boolean | null;
};

function rehypeHook(chainId: number): Address | null {
  try {
    return (getAddresses(chainId) as unknown as { rehypeDopplerHookInitializer?: Address }).rehypeDopplerHookInitializer ?? null;
  } catch {
    return null;
  }
}

/**
 * Pending fees for the creator, in both tokens, from the same two sources the Claim button drains:
 * the initializer-side locked positions (MulticurvePool.getPendingFees) and the Rehype hook bucket
 * (RehypeDopplerHookInitializer.getPendingFees). Plus the live fee schedule.
 */
export async function getMojiFees(m: MojiRow, prices: { stockUsd: number; mojiUsd: number }, beneficiary?: Address): Promise<MojiFees> {
  const claimed: FeeAmounts = { stock: Number(m.fees_creator_stock_claimed ?? 0), moji: Number(m.fees_creator_moji_claimed ?? 0) };
  const fallback: MojiFees = {
    pending: { stock: 0, moji: 0 },
    claimed,
    pendingStockUsd: 0,
    pendingMojiUsd: 0,
    sources: { pool: false, hook: false },
    bySource: { pool: { stock: 0, moji: 0 }, hook: { stock: 0, moji: 0 } },
    pendingUsd: Number(m.fees_unclaimed_usd ?? 0),
    claimedUsd: Number(m.fees_claimed_usd ?? 0),
    earnedUsd: Number(m.fees_unclaimed_usd ?? 0) + Number(m.fees_claimed_usd ?? 0),
    schedule: null,
    live: false,
    assetIsToken0: null,
  };
  const chain = chainById(m.chain_id);
  const who = beneficiary ?? (m.creator_address as Address | null);
  if (!m.token_address || !who || !chain?.viem) return fallback;
  const stock = findNumeraire(m.chain_id, m.stock_address);
  const stockDecimals = stock?.decimals ?? 18;

  try {
    const pc = publicClientFor(chain.viem);
    const sdk = new DopplerSDK({ publicClient: pc, chainId: chain.viem.id });
    const token = m.token_address as Address;
    const creator = who;

    const pool = await sdk.getMulticurvePool(token);
    const state = await pool.getState();
    const assetIsToken0 = state.poolKey.currency0.toLowerCase() === token.toLowerCase();

    let fees0 = 0n;
    let fees1 = 0n;
    const sources = { pool: false, hook: false };
    const raw = { pool: { f0: 0n, f1: 0n }, hook: { f0: 0n, f1: 0n } };
    const failures: string[] = [];
    try {
      const p = await withRetry(() => pool.getPendingFees(creator));
      fees0 += p.fees0;
      fees1 += p.fees1;
      raw.pool = { f0: p.fees0, f1: p.fees1 };
      sources.pool = p.fees0 > 0n || p.fees1 > 0n;
    } catch (e) {
      failures.push("pool: " + short(e));
    }

    let schedule: FeeSchedule | null = null;
    const hookAddr = rehypeHook(m.chain_id);
    if (hookAddr && m.pool_id) {
      try {
        const hook = await sdk.getRehypeDopplerHookInitializer(hookAddr);
        try {
          const p = await withRetry(() => hook.getPendingFees(m.pool_id as Hex, creator));
          fees0 += p.fees0;
          fees1 += p.fees1;
          raw.hook = { f0: p.fees0, f1: p.fees1 };
          sources.hook = p.fees0 > 0n || p.fees1 > 0n;
        } catch (e) {
          failures.push("hook: " + short(e));
        }
        const s = await withRetry(() => hook.getFeeSchedule(m.pool_id as Hex));
        const sched = { startingTime: Number(s.startingTime), startFee: Number(s.startFee), endFee: Number(s.endFee), durationSeconds: Number(s.durationSeconds) };
        const now = Date.now() / 1000;
        schedule = { ...sched, currentFee: currentFee(sched, now), decaying: now < sched.startingTime + sched.durationSeconds && sched.startFee > sched.endFee };
      } catch {}
    }
    if (!schedule) {
      try {
        const s = await pool.getFeeSchedule();
        if (s) {
          const now = Date.now() / 1000;
          schedule = { ...s, currentFee: currentFee(s, now), decaying: now < s.startingTime + s.durationSeconds && s.startFee > s.endFee };
        }
      } catch {}
    }

    const asset = Number(formatUnits(assetIsToken0 ? fees0 : fees1, 18));
    const num = Number(formatUnits(assetIsToken0 ? fees1 : fees0, stockDecimals));
    const split = (r: { f0: bigint; f1: bigint }) => ({ moji: Number(formatUnits(assetIsToken0 ? r.f0 : r.f1, 18)), stock: Number(formatUnits(assetIsToken0 ? r.f1 : r.f0, stockDecimals)) });
    const bySource = { pool: split(raw.pool), hook: split(raw.hook) };
    const pendingStockUsd = num * prices.stockUsd;
    const pendingMojiUsd = asset * prices.mojiUsd;
    const pendingUsd = pendingStockUsd + pendingMojiUsd;
    const claimedUsd = Number(m.fees_claimed_usd ?? 0);
    return {
      pending: { stock: num, moji: asset },
      claimed,
      bySource,
      pendingStockUsd,
      pendingMojiUsd,
      sources,
      pendingUsd,
      claimedUsd,
      earnedUsd: pendingUsd + claimedUsd,
      schedule,
      live: failures.length === 0,
      error: failures.length ? failures.join("; ") : undefined,
      assetIsToken0,
    };
  } catch (e) {
    return { ...fallback, error: short(e) };
  }
}

function short(e: unknown): string {
  const msg = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage ?? e.message : String(e);
  return msg.split("\n")[0].slice(0, 120);
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw last;
}
