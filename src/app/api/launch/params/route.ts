import { NextResponse } from "next/server";
import { createPublicClient, formatEther, type Address } from "viem";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import { validateCombo } from "@/lib/emoji";
import { chainById } from "@/config/chains";
import { chainLaunchable, findNumeraire } from "@/lib/numeraire";
import { isClaimed } from "@/lib/data";
import { launchQuota } from "@/lib/limits";
import { WALLET_CLAIMS_OPEN } from "@/config/limits";
import { stockPriceServer } from "@/lib/market";
import { buildParams } from "@/lib/doppler";
import { transportFor } from "@/lib/rpc";
import { CURVE_DEFAULTS } from "@/config/curve";
import { FEE_DECAY_SECONDS, FEE_END, FEE_START, SHARE_CREATOR, SHARE_PROTOCOL, SHARE_TREASURY, WAD } from "@/config/fees";
import { SITE_URL } from "@/lib/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MCAP_MIN = 1_000;
const MCAP_MAX = 10_000_000;

const pageFor = (display: string, ticker: string, chainId: number) => `${SITE_URL}/m/${encodeURIComponent(display)}/${encodeURIComponent(ticker)}${chainId !== 4663 ? `/${chainId}` : ""}`;

const fail = (error: string, code: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, code, ...extra }, { status });

/**
 * GET /api/launch/params?combo=🍏&pair=AAPL&creator=0x…[&chainId=4663][&mcap=5000]
 *
 * The launch, assembled server-side for a wallet that is not in a browser: the exact Airlock `create` calldata the
 * app would sign, ready to send from `creator`. Refuses (with a code) before any gas is spent when the combo is
 * invalid or already paired, the pair is not listed, or the wallet is over its cap. The chain, the pair and the fee
 * structure are the same as the app's; nothing here is configurable beyond the launch market cap.
 *
 * Send `tx` from `creator` (it must be the tx sender), wait for the receipt, then POST /api/launch with `then.record.body`
 * plus the tx hash. `predicted` is what the chain will produce for this exact calldata (a fresh salt per call).
 */
export async function GET(req: Request) {
  if (!WALLET_CLAIMS_OPEN) return fail("Wallet launches are closed; launch from the app with an X account", "WALLET_CLAIMS_CLOSED", 403);
  const q = new URL(req.url).searchParams;
  const v = validateCombo(q.get("combo") ?? "");
  if (!v.ok) return fail(v.reason, "BAD_COMBO", 400);

  const chain = chainById(Number(q.get("chainId") ?? 4663));
  if (!chain || !chainLaunchable(chain) || !chain.viem) return fail("That chain is not live yet", "CHAIN_NOT_LIVE", 400);

  const stock = findNumeraire(chain.chainId, q.get("pair") ?? "");
  if (!stock) return fail("Pair must be a listed stock or token on this chain (ticker or address). See GET /api/pairs", "PAIR_NOT_LISTED", 400);

  const creator = (q.get("creator") ?? "") as Address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(creator)) return fail("creator must be the 0x address that will send the launch tx", "BAD_INPUT", 400);

  const mcapStart = q.get("mcap") ? Number(q.get("mcap")) : CURVE_DEFAULTS.mcapStart;
  if (!Number.isFinite(mcapStart) || mcapStart < MCAP_MIN || mcapStart > MCAP_MAX) return fail(`mcap must be between ${MCAP_MIN} and ${MCAP_MAX} USD`, "BAD_INPUT", 400);

  const taken = await isClaimed(v.normalized, chain.chainId, stock.address);
  if (taken.claimed) {
    return fail(`${v.display} is already paired to ${stock.ticker} on ${chain.short}`, "CLAIMED", 409, { owner: pageFor(taken.display ?? v.display, taken.ticker ?? stock.ticker, chain.chainId) });
  }

  const quota = await launchQuota({ address: creator });
  if (quota.blocked) return fail(quota.message ?? "Launch cap reached", "DEAD_CAP", 429, { quota });

  const stockPriceUsd = await stockPriceServer(chain.chainId, stock.address, stock.ticker);
  if (!(stockPriceUsd > 0)) return fail(`No USD price for ${stock.ticker} right now`, "NO_PRICE", 502);

  const curve = { ...CURVE_DEFAULTS, mcapStart };
  try {
    const params = await buildParams({ chain, stock, combo: v.display, creator, curve, stockPriceUsd });
    const publicClient = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
    const sdk = new DopplerSDK({ publicClient, chainId: chain.chainId });
    const [prepared, gasPrice] = await Promise.all([sdk.factory.prepareCreateMulticurve(params, { account: creator }), publicClient.getGasPrice()]);
    const gas = prepared.gasEstimate.status === "estimated" ? prepared.gasEstimate.gas : null;
    const costWei = gas ? (gas * gasPrice * 12n) / 10n : null;
    const pct = (wad: bigint) => Number((wad * 10000n) / WAD) / 100;

    return NextResponse.json(
      {
        ok: true,
        combo: { display: v.display, normalized: v.normalized, emoji: v.emoji },
        chain: { id: chain.chainId, name: chain.name, gasSymbol: chain.gasSymbol, explorer: chain.viem.blockExplorers?.default.url ?? null },
        pair: { ticker: stock.ticker, name: stock.name, address: stock.address, decimals: stock.decimals, priceUsd: stockPriceUsd },
        creator,
        launch: { supply: curve.supply, sellFraction: curve.sellFraction, mcapStartUsd: curve.mcapStart },
        fees: {
          swap: { startPct: FEE_START / 1e4, endPct: FEE_END / 1e4, decaySeconds: FEE_DECAY_SECONDS },
          split: { creatorPct: pct(SHARE_CREATOR), treasuryPct: pct(SHARE_TREASURY), protocolPct: pct(SHARE_PROTOCOL) },
        },
        predicted: { tokenAddress: prepared.prediction.tokenAddress, poolId: prepared.prediction.poolId, poolOrHookAddress: prepared.prediction.poolOrHookAddress },
        tx: { chainId: chain.chainId, from: creator, to: prepared.transaction.to, data: prepared.transaction.data, value: prepared.transaction.value.toString(), gas: gas?.toString() ?? null },
        gas: { estimate: gas?.toString() ?? null, priceWei: gasPrice.toString(), costWei: costWei?.toString() ?? null, costNative: costWei ? formatEther(costWei) : null, minNative: chain.minGasNative },
        quota,
        then: {
          record: {
            method: "POST",
            url: `${SITE_URL}/api/launch`,
            body: { combo: v.display, chainId: chain.chainId, stockAddress: stock.address, tokenAddress: prepared.prediction.tokenAddress, poolId: prepared.prediction.poolId, txHash: "<hash of the sent tx>", supply: String(curve.supply), creatorAddress: creator, agent: true },
          },
          page: pageFor(v.display, stock.ticker, chain.chainId),
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    return fail(`Could not assemble the launch: ${msg.split("\n")[0].slice(0, 240)}`, "BUILD_FAILED", 502);
  }
}
