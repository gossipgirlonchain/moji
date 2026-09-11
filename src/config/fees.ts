import { parseEther, isAddress, type Address } from "viem";

/**
 * Fee structure for every moji pool.
 *
 * Units: Uniswap V4 fee pips, 1_000_000 = 100%. So 750_000 = 75% and 10_000 = 1%.
 * Verified against the SDK: V4_MAX_FEE = 100_000 (10%) for static tiers, DECAY_MAX_START_FEE = 800_000 (80%)
 * for hook fee schedules, TICK_SPACINGS[10000] = 200.
 *
 * On Robinhood Chain (4663) the SDK has no `v4DecayMulticurveInitializer`, so `withDecay()` throws there.
 * The decay is delivered by the RehypeDopplerHookInitializer instead, whose fee schedule is
 * startFee → endFee over durationSeconds (same units).
 */
/**
 * Anti-snipe schedule: 75% at launch decaying to 1% over the first 16 seconds, then 1% forever.
 * Bots that buy in the first blocks pay most of their trade in fees to the beneficiaries.
 * 750_000 is under both the Rehype contract cap (0.8e6) and the SDK's DECAY_MAX_START_FEE (800_000).
 */
export const FEE_START = 750_000; // 75%
export const FEE_END = 10_000; // 1%, terminal
export const FEE_DECAY_SECONDS = 16;
/** Tick spacing for the terminal 1% tier (standard HIGH tier). */
export const FEE_TICK_SPACING = 200;

export const WAD = 10n ** 18n;

export const SHARE_CREATOR = parseEther("0.70");
export const SHARE_TREASURY = parseEther("0.25");
export const SHARE_PROTOCOL = parseEther("0.05");

export const MOJI_TREASURY = (process.env.NEXT_PUBLIC_MOJI_TREASURY ?? "") as Address;

/**
 * Integrator address passed to the Doppler Airlock on every launch (`.withIntegrator`). This is how
 * mojis are attributed to moji in the Doppler app, and where Airlock-level integrator fees accrue.
 * Defaults to the treasury.
 */
export const MOJI_INTEGRATOR = ((process.env.NEXT_PUBLIC_MOJI_INTEGRATOR || process.env.NEXT_PUBLIC_MOJI_TREASURY) ?? "") as Address;

export type Beneficiary = { beneficiary: Address; shares: bigint };

/**
 * Lockable beneficiaries: creator 70%, moji treasury 25%, Doppler protocol owner 5%.
 * Throws if the treasury is unset, the protocol share is not exactly 5%, or the shares do not sum to WAD.
 */
export function buildBeneficiaries(creator: Address, protocolOwner: Address, treasury: Address = MOJI_TREASURY): Beneficiary[] {
  if (!isAddress(treasury) || /^0x0{40}$/i.test(treasury)) {
    throw new Error("NEXT_PUBLIC_MOJI_TREASURY is not set to a valid address");
  }
  if (!isAddress(creator) || !isAddress(protocolOwner)) throw new Error("Bad creator or protocol owner address");
  const set = new Set([creator, protocolOwner, treasury].map((a) => a.toLowerCase()));
  if (set.size !== 3) throw new Error("creator, treasury and protocol owner must be three distinct addresses");

  const list: Beneficiary[] = [
    { beneficiary: creator, shares: SHARE_CREATOR },
    { beneficiary: treasury, shares: SHARE_TREASURY },
    { beneficiary: protocolOwner, shares: SHARE_PROTOCOL },
  ];
  assertSharesSumToWad(list, protocolOwner);
  return list;
}

export function assertSharesSumToWad(list: Beneficiary[], protocolOwner?: Address): void {
  const total = list.reduce((s, b) => s + b.shares, 0n);
  if (total !== WAD) throw new Error(`Beneficiary shares must sum to exactly 1e18, got ${total}`);
  if (protocolOwner) {
    const p = list.find((b) => b.beneficiary.toLowerCase() === protocolOwner.toLowerCase());
    if (!p || p.shares !== SHARE_PROTOCOL) throw new Error("Protocol owner must hold exactly 5% (0.05e18) of shares");
  }
}

/** Linear decay: current fee in pips given the on-chain schedule. */
export function currentFee(s: { startingTime: number; startFee: number; endFee: number; durationSeconds: number }, now = Date.now() / 1000): number {
  if (s.durationSeconds <= 0 || now >= s.startingTime + s.durationSeconds) return s.endFee;
  if (now <= s.startingTime) return s.startFee;
  const t = (now - s.startingTime) / s.durationSeconds;
  return Math.round(s.startFee - (s.startFee - s.endFee) * t);
}

export function feePct(pips: number, digits = 1): string {
  const pct = pips / 10_000;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(digits)}%`;
}
