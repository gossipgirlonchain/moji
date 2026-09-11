"use client";

import { createPublicClient, createWalletClient, custom, type Address, type Hex } from "viem";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import { chainById } from "@/config/chains";
import { transportFor } from "./rpc";
import { rehypeHookAddress } from "./doppler";
import { ensureChain } from "./wallet";

export type ClaimTarget = {
  combo: string;
  chainId: number;
  tokenAddress: string;
  poolId: string | null;
  sources: { pool: boolean; hook: boolean };
  bySource?: { pool: { stock: number; moji: number }; hook: { stock: number; moji: number } };
  /** USD of each source, to skip dust */
  usd?: { pool: number; hook: number };
};

export type ClaimStep = { label: string; source: "pool" | "hook" };

/**
 * Claim one pool for the connected wallet: pool.collectFees() then hook.claimFees(poolId).
 * Calls onStep before each signature. Records whatever landed via the receipts. Throws on wallet rejection
 * (after recording any step that did succeed).
 */
export async function claimPool(
  t: ClaimTarget,
  wallet: ConnectedWallet,
  address: Address,
  opts: { minUsd?: number; onStep?: (i: number, n: number, step: ClaimStep) => void } = {},
): Promise<{ hashes: Hex[]; skipped: boolean }> {
  const chain = chainById(t.chainId);
  if (!chain?.viem) throw new Error("unknown chain");
  const min = opts.minUsd ?? 0;
  const doPool = t.sources.pool && (t.usd?.pool ?? Infinity) >= min;
  const doHook = t.sources.hook && Boolean(t.poolId) && (t.usd?.hook ?? Infinity) >= min;
  if (!doPool && !doHook) return { hashes: [], skipped: true };

  const provider = await ensureChain(wallet, chain.viem);
  const publicClient = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
  const walletClient = createWalletClient({ chain: chain.viem, account: address, transport: custom(provider) });
  const sdk = new DopplerSDK({ publicClient, walletClient, chainId: chain.viem.id });

  const steps: (ClaimStep & { go: () => Promise<{ transactionHash: Hex }> })[] = [];
  if (doPool) {
    const pool = await sdk.getMulticurvePool(t.tokenAddress as Address);
    steps.push({ label: "pool fees", source: "pool", go: () => pool.collectFees() });
  }
  if (doHook) {
    const hook = await sdk.getRehypeDopplerHookInitializer(rehypeHookAddress(t.chainId));
    steps.push({ label: "swap fees", source: "hook", go: () => hook.claimFees(t.poolId as Hex) });
  }

  const hashes: Hex[] = [];
  const record = () =>
    hashes.length
      ? fetch(`/api/mojis/${encodeURIComponent(t.combo)}/claimed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHashes: hashes }) }).catch(() => {})
      : Promise.resolve();
  try {
    for (let i = 0; i < steps.length; i++) {
      opts.onStep?.(i + 1, steps.length, steps[i]);
      const r = await steps[i].go();
      hashes.push(r.transactionHash);
    }
  } catch (e) {
    await record();
    throw e;
  }
  await record();
  return { hashes, skipped: false };
}
