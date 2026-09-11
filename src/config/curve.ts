import { parseEther } from "viem";

/**
 * Sensible multicurve defaults. Hidden behind the "advanced" disclosure on /launch.
 * Market caps are USD; the SDK converts to ticks using the numeraire (stock) price.
 */
export type CurveDefaults = {
  /** Total supply, whole tokens */
  supply: number;
  /** Fraction of supply sold on the curve (rest is held by the token / governance) */
  sellFraction: number;
  /** Launch market cap in USD */
  mcapStart: number;
  /** Where the main curve ends, USD */
  mcapEnd: number;
  /** Tail curve: extends to 'max' tick with this share of supply */
  tailShare: number;
};

export const CURVE_DEFAULTS: CurveDefaults = {
  supply: 1_000_000_000,
  sellFraction: 0.9,
  mcapStart: 5_000,
  mcapEnd: 2_000_000,
  tailShare: 0.1,
};

export function supplyWei(d: CurveDefaults) {
  return parseEther(String(d.supply));
}
export function sellWei(d: CurveDefaults) {
  return parseEther(String(Math.floor(d.supply * d.sellFraction)));
}
