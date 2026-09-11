/**
 * Dry run of the launch params against Robinhood Chain (4663) without a funded key.
 * Assembles the multicurve + rehype params exactly as the app does, then asks the SDK to
 * prepare the Airlock create call for a throwaway account (eth_call only, nothing is sent).
 *
 *   NEXT_PUBLIC_MOJI_TREASURY=0x... npx tsx scripts/check-launch.ts
 */
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DopplerSDK, getAirlockOwner } from "@whetstone-research/doppler-sdk/evm";
import { robinhoodChain } from "../src/config/chains";
import { findStock } from "../src/config/stocks";
import { buildParams } from "../src/lib/doppler";
import { FEE_START, FEE_END, FEE_DECAY_SECONDS, buildBeneficiaries } from "../src/config/fees";

async function main() {
  const chain = { key: "robinhood", chainId: 4663, name: "Robinhood Chain", short: "Robinhood", emoji: "🪶", viem: robinhoodChain, gasSymbol: "ETH", minGasNative: "0.0005" } as const;
  const stock = findStock(4663, "AAPL")!;
  const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // throwaway
  const protocolOwner = await getAirlockOwner(publicClient);
  console.log("airlock owner", protocolOwner);
  console.log("beneficiaries", buildBeneficiaries(account.address, protocolOwner).map((b) => `${b.beneficiary} ${b.shares}`));
  console.log(`fee schedule ${FEE_START / 1e4}% -> ${FEE_END / 1e4}% over ${FEE_DECAY_SECONDS}s`);

  const params = await buildParams({
    chain: chain as never,
    stock,
    combo: "🧪🍏",
    creator: account.address,
    provider: { request: async () => { throw new Error("no provider in dry run"); } } as never,
    stockPriceUsd: 230,
  });
  console.log("initializer", JSON.stringify(params.initializer, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log("pool.fee", params.pool.fee, "tickSpacing", params.pool.tickSpacing, "curves", params.pool.curves.length, "beneficiaries", params.pool.beneficiaries?.length);

  const sdk = new DopplerSDK({ publicClient, chainId: 4663 });
  const prepared = await sdk.factory.prepareCreateMulticurve(params, { account: account.address });
  console.log("predicted token", prepared.prediction.tokenAddress);
  console.log("predicted poolId", prepared.prediction.poolId);
  console.log("poolKey.fee", prepared.prediction.poolKey.fee, "(8388608 = dynamic fee flag)", "hooks", prepared.prediction.poolKey.hooks);
  console.log("gas", prepared.gasEstimate);
  console.log("OK: params assemble and the Airlock create call simulates on 4663");
}

main().catch((e) => {
  console.error("FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
