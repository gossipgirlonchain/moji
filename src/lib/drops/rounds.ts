import "server-only";
import { formatUnits } from "viem";
import type { MojiRow } from "@/lib/supabase";
import { loadHolders, loadTransfers, type HolderRow } from "./holders";
import type { Split } from "./types";

export type RoundRules = {
  topN: number;
  holdDays: number;
  minHoldWei: bigint;
  minPayoutUsd: number;
  split: Split;
  capBps: number;
  excluded: string[];
  tokenDecimals: number;
};

export type Payout = { address: string; rank: number; heldWei: bigint; amountWei: bigint; amountUsd: number };

export type RoundResult = {
  potWei: bigint;
  paidWei: bigint;
  eligible: number;
  ranked: number; // holders that passed the hold rules before the top-N cut
  payouts: Payout[];
  belowFloor: number;
  thresholdWei: bigint | null; // smallest qualifying holding in the top N
  tokenPriceUsd: number;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * For every holder: the smallest balance they held at any point in [cutAt − holdDays, cutAt].
 * Someone who bought yesterday has a window minimum of 0 for a 7-day rule; someone who sold half
 * mid-window is counted on the half they kept the whole time. holdDays = 0 means the balance at the cut.
 */
export async function heldMinimums(m: MojiRow, holders: HolderRow[], holdDays: number, cutAt: Date): Promise<Map<string, bigint>> {
  const current = new Map(holders.map((h) => [h.address, h.balance]));
  if (holdDays <= 0) return current;
  const since = new Date(cutAt.getTime() - holdDays * 86_400_000);
  const transfers = await loadTransfers(m.id, since, cutAt);
  // balance at window start = current − net(window)
  const start = new Map(current);
  for (const t of transfers) {
    const v = BigInt(t.value);
    if (t.from_address !== ZERO && start.has(t.from_address)) start.set(t.from_address, (start.get(t.from_address) ?? 0n) + v);
    if (t.to_address !== ZERO && start.has(t.to_address)) start.set(t.to_address, (start.get(t.to_address) ?? 0n) - v);
  }
  const min = new Map<string, bigint>();
  const running = new Map<string, bigint>();
  for (const [a, b] of start) {
    const s = b < 0n ? 0n : b;
    running.set(a, s);
    min.set(a, s);
  }
  for (const t of transfers) {
    const v = BigInt(t.value);
    if (running.has(t.from_address)) {
      const nb = (running.get(t.from_address) ?? 0n) - v;
      running.set(t.from_address, nb < 0n ? 0n : nb);
      if ((min.get(t.from_address) ?? 0n) > nb) min.set(t.from_address, nb < 0n ? 0n : nb);
    }
    if (running.has(t.to_address)) running.set(t.to_address, (running.get(t.to_address) ?? 0n) + v);
  }
  return min;
}

/**
 * Cut one round: rank holders by what they held for the whole hold window, keep the top N above the
 * minimum holding, split the pot (pro-rata capped per wallet, or equal), and drop anyone whose payout
 * is under the USD floor, handing their share to the rest. Never pays more than `potWei`.
 */
export async function computeRound(m: MojiRow, rules: RoundRules, potWei: bigint, tokenPriceUsd: number, cutAt = new Date()): Promise<RoundResult> {
  const holders = await loadHolders(m, rules.excluded);
  const held = await heldMinimums(m, holders, rules.holdDays, cutAt);
  const qualified = holders
    .map((h) => ({ address: h.address, heldWei: held.get(h.address) ?? 0n }))
    .filter((h) => h.heldWei > 0n && h.heldWei >= rules.minHoldWei)
    .sort((a, b) => (b.heldWei > a.heldWei ? 1 : b.heldWei < a.heldWei ? -1 : a.address < b.address ? -1 : 1));
  const top = qualified.slice(0, Math.max(1, rules.topN));
  const empty: RoundResult = { potWei, paidWei: 0n, eligible: qualified.length, ranked: qualified.length, payouts: [], belowFloor: 0, thresholdWei: null, tokenPriceUsd };
  if (top.length === 0 || potWei === 0n) return empty;

  // weights
  let weights: bigint[];
  if (rules.split === "equal") weights = top.map(() => 1n);
  else {
    weights = top.map((h) => h.heldWei);
    if (rules.capBps > 0 && rules.capBps < 10_000) {
      // water-fill: nobody's weight exceeds capBps of the total; excess is spread over the uncapped
      for (let iter = 0; iter < 20; iter++) {
        const total = weights.reduce((s, w) => s + w, 0n);
        const cap = (total * BigInt(rules.capBps)) / 10_000n;
        let changed = false;
        weights = weights.map((w) => {
          if (w > cap) {
            changed = true;
            return cap;
          }
          return w;
        });
        if (!changed) break;
      }
    }
  }
  const unitUsd = (wei: bigint) => Number(formatUnits(wei, rules.tokenDecimals)) * tokenPriceUsd;
  const alloc = (idx: number[], pot: bigint): bigint[] => {
    const tw = idx.reduce((s, i) => s + weights[i], 0n);
    if (tw === 0n) return idx.map(() => 0n);
    return idx.map((i) => (pot * weights[i]) / tw);
  };

  // first pass, then drop below-floor wallets and re-split among the rest (their amounts only go up)
  let idx = top.map((_, i) => i);
  let amounts = alloc(idx, potWei);
  let belowFloor = 0;
  if (rules.minPayoutUsd > 0 && tokenPriceUsd > 0) {
    const keep = idx.filter((_, k) => unitUsd(amounts[k]) >= rules.minPayoutUsd);
    belowFloor = idx.length - keep.length;
    if (keep.length === 0) return { ...empty, belowFloor };
    idx = keep;
    amounts = alloc(idx, potWei);
  }
  const payouts: Payout[] = idx.map((i, k) => ({ address: top[i].address, rank: i + 1, heldWei: top[i].heldWei, amountWei: amounts[k], amountUsd: unitUsd(amounts[k]) })).filter((p) => p.amountWei > 0n);
  const paidWei = payouts.reduce((s, p) => s + p.amountWei, 0n);
  return { potWei, paidWei, eligible: qualified.length, ranked: qualified.length, payouts, belowFloor, thresholdWei: top[top.length - 1].heldWei, tokenPriceUsd };
}
