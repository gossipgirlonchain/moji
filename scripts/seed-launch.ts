/**
 * Real on-chain seed launches for the six seed mojis on Robinhood Chain (4663).
 *
 * Doppler is not deployed on the Robinhood testnet (46630), so seeds launch on 4663 itself.
 * Requires a funded key. Each launch is one Airlock transaction (you pay gas in ETH).
 *
 *   SEED_PRIVATE_KEY=0x... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-launch.ts
 *
 * For each seed row that has no token_address yet, it launches the token and writes
 * token_address / pool_id / tx_hash / creator_address back to Supabase.
 */
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DopplerSDK, MulticurveBuilder, getAirlockBeneficiary, WAD } from "@whetstone-research/doppler-sdk/evm";
import { robinhoodChain } from "../src/config/chains";
import { findStock } from "../src/config/stocks";
import { CURVE_DEFAULTS, sellWei, supplyWei } from "../src/config/curve";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const pk = process.env.SEED_PRIVATE_KEY as `0x${string}`;
if (!url || !service || !pk) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_PRIVATE_KEY");

const sb = createClient(url, service);
const account = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
const walletClient = createWalletClient({ chain: robinhoodChain, account, transport: http() });
const sdk = new DopplerSDK({ publicClient, walletClient, chainId: robinhoodChain.id });

async function stockPrice(ticker: string): Promise<number> {
  const r = await fetch(`https://api.robinhood.com/rhj/prices/${ticker}`, { headers: { "user-agent": "moji-seed" } });
  const j = (await r.json()) as Record<string, unknown>;
  const mid = (Number(j.bid) + Number(j.ask)) / 2;
  if (!isFinite(mid) || mid <= 0) throw new Error("no price for " + ticker);
  return mid;
}

async function main() {
  const { data: rows } = await sb.from("mojis").select("*").is("token_address", null).eq("chain_id", 4663);
  for (const m of rows ?? []) {
    const stock = findStock(4663, m.stock_address);
    if (!stock) {
      console.log("skip", m.display, "stock not in list");
      continue;
    }
    const price = await stockPrice(stock.ticker);
    const protocol = await getAirlockBeneficiary(publicClient);
    const curve = CURVE_DEFAULTS;
    const params = MulticurveBuilder.forChain(4663)
      .tokenConfig({ type: "standard", name: m.display, symbol: m.display, tokenURI: `https://moji.wtf/api/meta/${encodeURIComponent(m.display)}` })
      .saleConfig({ initialSupply: supplyWei(curve), numTokensToSell: sellWei(curve), numeraire: stock.address })
      .withCurves({
        numerairePrice: price,
        numeraireDecimals: stock.decimals,
        fee: curve.fee,
        curves: [
          { marketCap: { start: curve.mcapStart, end: curve.mcapEnd }, numPositions: 11, shares: parseEther((1 - curve.tailShare).toFixed(6)) },
          { marketCap: { start: curve.mcapEnd, end: "max" }, numPositions: 5, shares: parseEther(curve.tailShare.toFixed(6)) },
        ],
        beneficiaries: [protocol, { beneficiary: account.address, shares: WAD - protocol.shares }],
      })
      .withGovernance({ type: "noOp" })
      .withMigration({ type: "noOp" })
      .withUserAddress(account.address)
      .build();

    console.log("launching", m.display, "/", stock.ticker, "at stock price", price);
    const sim = await sdk.factory.simulateCreateMulticurve(params);
    console.log("  predicted token", sim.tokenAddress, "gas", sim.gasEstimate?.toString());
    const res = await sim.execute();
    console.log("  tx", res.transactionHash, "token", res.tokenAddress, "pool", res.poolId);
    await sb
      .from("mojis")
      .update({ token_address: res.tokenAddress, pool_id: res.poolId, tx_hash: res.transactionHash, creator_address: account.address, supply: curve.supply, market_cap_usd: curve.mcapStart, fees_claimed_usd: 0, fees_unclaimed_usd: 0 })
      .eq("id", m.id);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
