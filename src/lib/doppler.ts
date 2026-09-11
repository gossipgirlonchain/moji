"use client";

import { createPublicClient, createWalletClient, custom, http, parseEther, type Address, type EIP1193Provider } from "viem";
import { DopplerSDK, MulticurveBuilder, getAddresses, getAirlockOwner } from "@whetstone-research/doppler-sdk/evm";
import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import { CURVE_DEFAULTS, sellWei, supplyWei, type CurveDefaults } from "@/config/curve";
import { FEE_DECAY_SECONDS, FEE_END, FEE_START, FEE_TICK_SPACING, WAD, assertSharesSumToWad, buildBeneficiaries } from "@/config/fees";

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

export function rehypeHookAddress(chainId: number): Address {
  const a = getAddresses(chainId) as unknown as { rehypeDopplerHookInitializer?: Address };
  if (!a.rehypeDopplerHookInitializer) throw new Error(`No RehypeDopplerHookInitializer on chain ${chainId}`);
  return a.rehypeDopplerHookInitializer;
}

/**
 * Build multicurve params.
 *
 * Fees: the pool swap fee decays 3% → 1% over 3600s. On Robinhood Chain the SDK has no decay
 * multicurve initializer (withDecay throws), so the schedule is set on the RehypeDopplerHookInitializer,
 * which makes the pool dynamic-fee and charges startFee → endFee itself.
 *
 * Beneficiaries (creator 70 / treasury 25 / protocol owner 5, WAD-summed and asserted) are set in two places:
 *  - pool.beneficiaries: initializer-side locked LP positions (MulticurvePool.getPendingFees / collectFees)
 *  - rehype feeBeneficiaries: the hook's own fee bucket, routed to beneficiaries (routeToBeneficiaryFees)
 */
export async function buildParams(input: LaunchInput) {
  const chainId = input.chain.chainId as 4663;
  const curve = input.curve ?? CURVE_DEFAULTS;
  const mainShare = 1 - curve.tailShare;
  const publicClient = createPublicClient({ chain: input.chain.viem!, transport: http() });
  const protocolOwner = await getAirlockOwner(publicClient);
  const beneficiaries = buildBeneficiaries(input.creator, protocolOwner);
  assertSharesSumToWad(beneficiaries, protocolOwner); // fail loudly before anything is signed

  return MulticurveBuilder.forChain(chainId)
    .tokenConfig({
      type: "dopplerERC20V1", // 4663 has no standard TokenFactory, only DopplerERC20V1Factory
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
      fee: FEE_END, // terminal fee; the hook overrides with the decaying schedule
      tickSpacing: FEE_TICK_SPACING,
      curves: [
        { marketCap: { start: curve.mcapStart, end: curve.mcapEnd }, numPositions: 11, shares: parseEther(mainShare.toFixed(6)) },
        { marketCap: { start: curve.mcapEnd, end: "max" }, numPositions: 5, shares: parseEther(curve.tailShare.toFixed(6)) },
      ],
      beneficiaries,
    })
    .withRehypeDopplerHookInitializer({
      hookAddress: rehypeHookAddress(chainId),
      startFee: FEE_START,
      endFee: FEE_END,
      durationSeconds: FEE_DECAY_SECONDS,
      feeRoutingMode: "routeToBeneficiaryFees",
      feeBeneficiaries: [beneficiaries[0], ...beneficiaries.slice(1)],
      // Everything the hook collects goes to the beneficiary bucket. No buybacks, no LP reinvest.
      feeDistributionInfo: {
        assetFeesToAssetBuybackWad: 0n,
        assetFeesToNumeraireBuybackWad: 0n,
        assetFeesToBeneficiaryWad: WAD,
        assetFeesToLpWad: 0n,
        numeraireFeesToAssetBuybackWad: 0n,
        numeraireFeesToNumeraireBuybackWad: 0n,
        numeraireFeesToBeneficiaryWad: WAD,
        numeraireFeesToLpWad: 0n,
      },
      buybackDestination: input.creator,
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
