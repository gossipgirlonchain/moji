import type { Address } from "viem";
import { MOJI_TREASURY } from "@/config/fees";

/** Minimal ERC-20 surface the drop sender needs. */
export const ERC20_MIN_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/**
 * Processing fee on drops, in bps of the amount sent to holders (default 50 = 0.5%). It is one extra
 * plain transfer from the creator to the treasury, sent after the holder transfers.
 */
export function dropsFeeBps(): number {
  const v = Number(process.env.NEXT_PUBLIC_DROPS_FEE_BPS ?? 50);
  return Number.isInteger(v) && v >= 0 && v <= 500 ? v : 50;
}

export function dropsFeeRecipient(): Address | null {
  return MOJI_TREASURY && /^0x[0-9a-fA-F]{40}$/.test(MOJI_TREASURY) && !/^0x0{40}$/i.test(MOJI_TREASURY) ? (MOJI_TREASURY as Address) : null;
}

export function feeFor(amountWei: bigint, bps: number): bigint {
  return (amountWei * BigInt(Math.max(0, bps))) / 10_000n;
}
