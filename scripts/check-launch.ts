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
import { CHAINS, robinhoodChain } from "../src/config/chains";
import { findStock, type Stock } from "../src/config/stocks";
import { numerairesFor } from "../src/lib/numeraire";
import { buildParams } from "../src/lib/doppler";
import { FEE_START, FEE_END, FEE_DECAY_SECONDS, buildBeneficiaries } from "../src/config/fees";

async function main() {
  // CHAIN=8453 NUMERAIRE=0x... npx tsx scripts/check-launch.ts   (defaults: Robinhood + AAPL)
  const chainId = Number(process.env.CHAIN ?? 4663);
  const chain = CHAINS.find((c) => c.chainId === chainId)!;
  if (!chain?.viem) throw new Error("unknown chain " + chainId);
  const stock: Stock = process.env.NUMERAIRE
    ? { ticker: process.env.TICKER ?? "TEST", name: "test numeraire", address: process.env.NUMERAIRE as `0x${string}`, logo: "", decimals: Number(process.env.NUMERAIRE_DECIMALS ?? 18) }
    : chain.numeraire === "weth" ? numerairesFor(chain)[0] : findStock(4663, "AAPL")!;
  void robinhoodChain;
  const publicClient = createPublicClient({ chain: chain.viem, transport: http() });
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
    stockPriceUsd: Number(process.env.NUMERAIRE_PRICE ?? 230),
  });
  console.log("initializer", JSON.stringify(params.initializer, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log("integrator", params.integrator);
  console.log("pool.fee", params.pool.fee, "tickSpacing", params.pool.tickSpacing, "curves", params.pool.curves.length, "beneficiaries", params.pool.beneficiaries?.length);

  const sdk = new DopplerSDK({ publicClient, chainId });
  const prepared = await sdk.factory.prepareCreateMulticurve(params, { account: account.address });
  console.log("predicted token", prepared.prediction.tokenAddress);
  console.log("predicted poolId", prepared.prediction.poolId);
  console.log("poolKey.fee", prepared.prediction.poolKey.fee, "(8388608 = dynamic fee flag)", "hooks", prepared.prediction.poolKey.hooks);
  console.log("gas", prepared.gasEstimate);
  console.log(`OK: params assemble and the Airlock create call simulates on ${chain.name} (${chainId})`);
}

main().catch((e) => {
  console.error("FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
