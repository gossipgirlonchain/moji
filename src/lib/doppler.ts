"use client";

import { createPublicClient, createWalletClient, custom, http, parseEther, type Address, type EIP1193Provider } from "viem";
import { DopplerSDK, MulticurveBuilder, getAddresses, getAirlockBeneficiary, WAD } from "@whetstone-research/doppler-sdk/evm";
import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import { CURVE_DEFAULTS, sellWei, supplyWei, type CurveDefaults } from "@/config/curve";

export type LaunchInput = {
  chain: MojiChain;
  stock: Stock;
  /** Display combo, becomes the token symbol and name */
  combo: string;
  creator: Address;
  provider: EIP1193Provider;
  curve?: CurveDefaults;
  /** USD price of one whole stock token (numeraire). */
  stockPriceUsd: number;
};

export type LaunchResult = {
  tokenAddress: Address;
  poolId: `0x${string}`;
  txHash: `0x${string}`;
  supply: string;
};

/**
 * Build multicurve params. Exported so the launch page can simulate gas before sending.
 * Fees: pool is locked with beneficiaries (noOp migration). Protocol owner takes the required 5%,
 * the creator takes the remaining 95%. Anyone can call collectFees() to distribute.
 */
export async function buildParams(input: LaunchInput) {
  const chainId = input.chain.chainId as 4663;
  const curve = input.curve ?? CURVE_DEFAULTS;
  const mainShare = 1 - curve.tailShare;
  const publicClient = createPublicClient({ chain: input.chain.viem!, transport: http() });
  const protocol = await getAirlockBeneficiary(publicClient); // 5% to Airlock owner
  const beneficiaries = [protocol, { beneficiary: input.creator, shares: WAD - protocol.shares }];

  return MulticurveBuilder.forChain(chainId)
    .tokenConfig({
      type: "standard",
      name: input.combo,
      symbol: input.combo,
      tokenURI: `https://moji.wtf/api/meta/${encodeURIComponent(input.combo)}`,
    })
    .saleConfig({
      initialSupply: supplyWei(curve),
      numTokensToSell: sellWei(curve),
      numeraire: input.stock.address,
    })
    .withCurves({
      numerairePrice: input.stockPriceUsd,
      numeraireDecimals: input.stock.decimals,
      fee: curve.fee,
      curves: [
        {
          marketCap: { start: curve.mcapStart, end: curve.mcapEnd },
          numPositions: 11,
          shares: parseEther(mainShare.toFixed(6)),
        },
        {
          marketCap: { start: curve.mcapEnd, end: "max" },
          numPositions: 5,
          shares: parseEther(curve.tailShare.toFixed(6)),
        },
      ],
      beneficiaries,
    })
    .withGovernance({ type: "noOp" })
    .withMigration({ type: "noOp" })
    .withUserAddress(input.creator)
    .build();
}

export function makeSdk(input: Pick<LaunchInput, "chain" | "creator" | "provider">) {
  const chain = input.chain.viem!;
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ chain, account: input.creator, transport: custom(input.provider) });
  return new DopplerSDK({ publicClient, walletClient, chainId: chain.id });
}

/** Estimate launch gas in wei. Returns null when simulation is unavailable. */
export async function estimateLaunchGasWei(input: LaunchInput): Promise<bigint | null> {
  try {
    const sdk = makeSdk(input);
    const params = await buildParams(input);
    const sim = await sdk.factory.simulateCreateMulticurve(params);
    if (!sim.gasEstimate) return null;
    const chain = input.chain.viem!;
    const pc = createPublicClient({ chain, transport: http() });
    const gasPrice = await pc.getGasPrice();
    return (sim.gasEstimate * gasPrice * 12n) / 10n;
  } catch {
    return null;
  }
}

/** One wallet signature: create the token + multicurve pool via Doppler's Airlock. */
export async function launchMoji(input: LaunchInput): Promise<LaunchResult> {
  const sdk = makeSdk(input);
  const params = await buildParams(input);
  const res = await sdk.factory.createMulticurve(params);
  return {
    tokenAddress: res.tokenAddress,
    poolId: res.poolId,
    txHash: res.transactionHash,
    supply: String((input.curve ?? CURVE_DEFAULTS).supply),
  };
}

export function airlockFor(chainId: number): Address | null {
  try {
    return getAddresses(chainId).airlock;
  } catch {
    return null;
  }
}
