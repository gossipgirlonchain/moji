import { parseEther } from "viem";

/**
 * Multicurve shape (per Austin @ Doppler, 2026-09-11):
 *   curve A: $5K → $100M, 1 position,  50%
 *   curve B: $5K → $50M,  4 positions, 47.5%
 *   tail:    $100M → max, 1 position,  2.5%
 * Shares sum to exactly 100%. 100% of supply goes on the curve: with noOp governance the Airlock
 * burns whatever is not put on the curve.
 */
export type CurveDefaults = {
  /** Total supply, whole tokens */
  supply: number;
  /** Fraction of supply sold on the curve. Must be 1 (see above). */
  sellFraction: number;
  /** Launch market cap in USD (start of both main curves) */
  mcapStart: number;
};

export const CURVE_DEFAULTS: CurveDefaults = {
  supply: 1_000_000_000,
  sellFraction: 1,
  mcapStart: 5_000,
};

export const CURVE_A_END = 100_000_000;
export const CURVE_B_END = 50_000_000;

/** The three curves for the SDK's withCurves(), given a launch market cap. */
export function curvesFor(mcapStart: number) {
  return [
    { marketCap: { start: mcapStart, end: CURVE_A_END }, numPositions: 1, shares: parseEther("0.5") },
    { marketCap: { start: mcapStart, end: CURVE_B_END }, numPositions: 4, shares: parseEther("0.475") },
    { marketCap: { start: CURVE_A_END, end: "max" as const }, numPositions: 1, shares: parseEther("0.025") },
  ];
}

export function supplyWei(d: CurveDefaults) {
  return parseEther(String(d.supply));
}
export function sellWei(d: CurveDefaults) {
  return parseEther(String(Math.floor(d.supply * d.sellFraction)));
}
