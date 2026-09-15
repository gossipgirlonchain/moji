import type { Abi, Address } from "viem";
import artifact from "./MojiDrops.json";

/** ABI + bytecode compiled from contracts/MojiDrops.sol (`npm run drops:compile`). */
export const MOJI_DROPS_ABI = artifact.abi as Abi;
export const MOJI_DROPS_BYTECODE = artifact.bytecode as `0x${string}`;

/**
 * Deployed MojiDrops escrow per chain. `NEXT_PUBLIC_DROPS_CONTRACT` is the address on Robinhood Chain (4663);
 * `NEXT_PUBLIC_DROPS_CONTRACT_<chainId>` overrides per chain. Unset means the feature is off on that chain.
 */
export function dropsContract(chainId: number): Address | null {
  const perChain = process.env[`NEXT_PUBLIC_DROPS_CONTRACT_${chainId}`];
  const v = perChain ?? (chainId === 4663 ? process.env.NEXT_PUBLIC_DROPS_CONTRACT : undefined);
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null;
}

/** Processing fee on drop payouts, in bps. The escrow snapshots its own value per campaign at funding; this is what the form previews. */
export function dropsFeeBps(): number {
  const v = Number(process.env.NEXT_PUBLIC_DROPS_FEE_BPS ?? 50);
  return Number.isInteger(v) && v >= 0 && v <= 500 ? v : 50;
}

export const ERC20_MIN_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** The uuid of a campaign row packed into the bytes32 `key` the contract stores, so a receipt can be matched to its row. */
export function campaignKey(id: string): `0x${string}` {
  return `0x${id.replace(/-/g, "").padEnd(64, "0")}`;
}
