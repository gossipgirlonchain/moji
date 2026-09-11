import "server-only";
import { formatUnits, type Address, type Hex } from "viem";
import { publicClientFor } from "./rpc";
import { DopplerSDK, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { chainById } from "@/config/chains";
import { findStock } from "@/config/stocks";
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
  /** raw pending split by source, so the Claim button knows which calls to make */
  sources: { pool: boolean; hook: boolean };
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
export async function getMojiFees(m: MojiRow, prices: { stockUsd: number; mojiUsd: number }): Promise<MojiFees> {
  const fallback: MojiFees = {
    pending: { stock: 0, moji: 0 },
    sources: { pool: false, hook: false },
    pendingUsd: Number(m.fees_unclaimed_usd ?? 0),
    claimedUsd: Number(m.fees_claimed_usd ?? 0),
    earnedUsd: Number(m.fees_unclaimed_usd ?? 0) + Number(m.fees_claimed_usd ?? 0),
    schedule: null,
    live: false,
    assetIsToken0: null,
  };
  const chain = chainById(m.chain_id);
  if (!m.token_address || !m.creator_address || !chain?.viem) return fallback;
  const stock = findStock(m.chain_id, m.stock_address);
  const stockDecimals = stock?.decimals ?? 18;

  try {
    const pc = publicClientFor(chain.viem);
    const sdk = new DopplerSDK({ publicClient: pc, chainId: chain.viem.id });
    const token = m.token_address as Address;
    const creator = m.creator_address as Address;

    const pool = await sdk.getMulticurvePool(token);
    const state = await pool.getState();
    const assetIsToken0 = state.poolKey.currency0.toLowerCase() === token.toLowerCase();

    let fees0 = 0n;
    let fees1 = 0n;
    const sources = { pool: false, hook: false };
    const failures: string[] = [];
    try {
      const p = await withRetry(() => pool.getPendingFees(creator));
      fees0 += p.fees0;
      fees1 += p.fees1;
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
    const pendingUsd = asset * prices.mojiUsd + num * prices.stockUsd;
    const claimedUsd = Number(m.fees_claimed_usd ?? 0);
    return {
      pending: { stock: num, moji: asset },
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
