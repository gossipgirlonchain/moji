import "server-only";
import { createWalletClient, formatEther, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import { supabaseServer, hasSupabase } from "./supabase";
import { NETWORK } from "./network";
import { chainById } from "@/config/chains";
import { findNumeraire, chainLaunchable } from "./numeraire";
import { launchQuota } from "./limits";
import { isClaimed } from "./data";
import { stockPriceServer, nativePriceUsd } from "./market";
import { buildParams } from "./doppler";
import { publicClientFor, transportFor } from "./rpc";
import { verifyLaunchTx } from "./launch-verify";
import { recordLaunch } from "./record-launch";
import { validateCombo } from "./emoji";
import { validateMeme } from "./meme-coin";
import { CURVE_DEFAULTS } from "@/config/curve";
import { WALLET_CLAIMS_OPEN } from "@/config/limits";

/**
 * Sponsored launches: moji pays the gas for an agent's launch. Not a faucet: no ETH is ever sent to the agent.
 * The sponsor wallet sends the Airlock create itself with the agent as creator and fee beneficiary, after the
 * agent signs a message proving it owns the wallet. Gas is only ever spent on a real launch that burns a combo.
 *
 * Env: SPONSOR_PRIVATE_KEY (a hot wallet holding only the budget), SPONSOR_BUDGET_USD (default 100),
 * SPONSOR_DAILY_MAX (default 10 launches per UTC day). Inert without the key.
 */
const KEY = (process.env.SPONSOR_PRIVATE_KEY ?? "").trim();
export const SPONSOR_ENABLED = /^0x[0-9a-fA-F]{64}$/.test(KEY);
export const SPONSOR_BUDGET_USD = Number(process.env.SPONSOR_BUDGET_USD ?? 100);
export const SPONSOR_DAILY_MAX = Number(process.env.SPONSOR_DAILY_MAX ?? 10);
/** Robinhood Chain only for the test. */
export const SPONSOR_CHAINS = new Set([4663]);
const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;
/** Skip a launch whose estimated gas would cost more than this: something is off with the network. */
const MAX_GAS_USD_PER_LAUNCH = 10;

export function sponsorAddress(): Address | null {
  return SPONSOR_ENABLED ? privateKeyToAccount(KEY as Hex).address : null;
}

/** For a meme, `combo` is `$PEPE` and `name` (the title) is part of the signed message, so the sponsor cannot retitle it. */
export function canonicalSponsorMessage(p: { creator: string; combo: string; pair: string; chainId: number; ts: number; name?: string | null }): string {
  return `moji sponsored launch v1\n${JSON.stringify({ chainId: p.chainId, combo: p.combo, creator: p.creator.toLowerCase(), ...(p.name ? { name: p.name } : {}), pair: p.pair.toLowerCase(), ts: p.ts })}`;
}

export type SponsorStatus = { enabled: boolean; sponsor: string | null; chainIds: number[]; budgetUsd: number; spentUsd: number; remainingUsd: number; today: number; dailyMax: number; balanceNative: string | null; open: boolean };

async function spent(): Promise<{ spentUsd: number; today: number }> {
  if (!hasSupabase()) return { spentUsd: 0, today: 0 };
  const sb = supabaseServer();
  const day = new Date();
  const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())).toISOString();
  const [{ data: all }, { count }] = await Promise.all([
    sb.from("sponsored_launches").select("gas_usd").eq("network", NETWORK).in("status", ["pending", "sent"]),
    sb.from("sponsored_launches").select("id", { count: "exact", head: true }).eq("network", NETWORK).in("status", ["pending", "sent"]).gte("created_at", dayStart),
  ]);
  return { spentUsd: ((all ?? []) as { gas_usd: number }[]).reduce((s, r) => s + Number(r.gas_usd ?? 0), 0), today: count ?? 0 };
}

export async function sponsorStatus(): Promise<SponsorStatus> {
  const sponsor = sponsorAddress();
  const { spentUsd, today } = await spent();
  let balanceNative: string | null = null;
  if (sponsor) {
    try {
      balanceNative = formatEther(await publicClientFor(chainById(4663)!.viem!).getBalance({ address: sponsor }));
    } catch {}
  }
  const remainingUsd = Math.max(0, SPONSOR_BUDGET_USD - spentUsd);
  return { enabled: SPONSOR_ENABLED, sponsor, chainIds: [...SPONSOR_CHAINS], budgetUsd: SPONSOR_BUDGET_USD, spentUsd, remainingUsd, today, dailyMax: SPONSOR_DAILY_MAX, balanceNative, open: SPONSOR_ENABLED && WALLET_CLAIMS_OPEN && remainingUsd > 0 && today < SPONSOR_DAILY_MAX };
}

export type SponsorRequest = { combo?: string; kind?: "moji" | "meme"; name?: string; symbol?: string; pair: string; chainId?: number; creator: string; ts: number; signature: string; mcap?: number };
export type SponsorResult = { ok: true; txHash: Hex; gasUsd: number; moji: Record<string, unknown>; href: string; url: string } | { ok: false; error: string; code: string; status: number };

/** Verify, check budget and slots, send the launch from the sponsor wallet, wait, record. */
export async function sponsorLaunch(req: SponsorRequest): Promise<SponsorResult> {
  if (!SPONSOR_ENABLED) return { ok: false, error: "Sponsored launches are not configured", code: "SPONSOR_CLOSED", status: 403 };
  if (!WALLET_CLAIMS_OPEN) return { ok: false, error: "Wallet launches are closed", code: "WALLET_CLAIMS_CLOSED", status: 403 };
  let v: Extract<ReturnType<typeof validateCombo>, { ok: true }>;
  let meme: { name: string; symbol: string } | null = null;
  if (req.kind === "meme") {
    const mv = validateMeme(req);
    if (!mv.ok) return { ok: false, error: mv.reason, code: "BAD_MEME", status: 400 };
    meme = { name: mv.name, symbol: mv.symbol };
    v = { ok: true, emoji: [], display: mv.display, normalized: mv.normalized };
  } else {
    const cv = validateCombo(req.combo ?? "");
    if (!cv.ok) return { ok: false, error: cv.reason, code: "BAD_COMBO", status: 400 };
    v = cv;
  }
  const chain = chainById(Number(req.chainId ?? 4663));
  if (!chain || !chain.viem || !chainLaunchable(chain)) return { ok: false, error: "That chain is not live yet", code: "CHAIN_NOT_LIVE", status: 400 };
  if (!SPONSOR_CHAINS.has(chain.chainId)) return { ok: false, error: `Sponsored launches run on chain ${[...SPONSOR_CHAINS].join(", ")} only`, code: "SPONSOR_CHAIN", status: 400 };
  const stock = findNumeraire(chain.chainId, req.pair ?? "");
  if (!stock) return { ok: false, error: "Pair must be a listed stock or token on this chain", code: "PAIR_NOT_LISTED", status: 400 };
  if (!isAddress(req.creator ?? "")) return { ok: false, error: "creator must be a 0x address", code: "BAD_INPUT", status: 400 };
  const creator = req.creator as Address;
  const ts = Number(req.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) return { ok: false, error: "ts must be the current time in ms (signature is good for 10 minutes)", code: "STALE_SIGNATURE", status: 400 };
  const message = canonicalSponsorMessage({ creator, combo: v.display, pair: stock.address, chainId: chain.chainId, ts, name: meme?.name });
  const good = await verifyMessage({ address: creator, message, signature: (req.signature ?? "0x") as Hex }).catch(() => false);
  if (!good) return { ok: false, error: "signature does not match the sponsored launch message", code: "BAD_SIGNATURE", status: 403 };
  const mcapStart = req.mcap ? Number(req.mcap) : CURVE_DEFAULTS.mcapStart;
  if (!Number.isFinite(mcapStart) || mcapStart < 1_000 || mcapStart > 10_000_000) return { ok: false, error: "mcap must be between 1000 and 10000000 USD", code: "BAD_INPUT", status: 400 };
  if (!hasSupabase()) return { ok: false, error: "no db", code: "SERVER_MISCONFIGURED", status: 500 };

  // Slots, the combo, and the budget, before anything is sent.
  const quota = await launchQuota({ address: creator });
  if (quota.blocked) return { ok: false, error: quota.message ?? "Launch cap reached", code: "NO_SLOTS", status: 429 };
  const taken = await isClaimed(v.normalized, chain.chainId, stock.address);
  if (taken.claimed) return { ok: false, error: `${v.display} is already paired to ${stock.ticker} on ${chain.short}`, code: "CLAIMED", status: 409 };
  const sb = supabaseServer();
  const { count: mine } = await sb.from("sponsored_launches").select("id", { count: "exact", head: true }).eq("network", NETWORK).ilike("creator", creator).in("status", ["pending", "sent"]);
  if ((mine ?? 0) > 0) return { ok: false, error: "this wallet already had a sponsored launch", code: "SPONSOR_USED", status: 429 };
  const status = await sponsorStatus();
  if (!status.open) return { ok: false, error: status.remainingUsd <= 0 ? "the sponsor budget is spent" : status.today >= SPONSOR_DAILY_MAX ? "today's sponsored launches are used up, try tomorrow" : "sponsored launches are closed", code: "SPONSOR_BUDGET", status: 429 };

  const [stockPriceUsd, ethUsd] = await Promise.all([stockPriceServer(chain.chainId, stock.address, stock.ticker), nativePriceUsd("ETH").catch(() => 0)]);
  if (!(stockPriceUsd > 0)) return { ok: false, error: `No USD price for ${stock.ticker} right now`, code: "NO_PRICE", status: 502 };

  const account = privateKeyToAccount(KEY as Hex);
  const publicClient = publicClientFor(chain.viem);
  let txHash: Hex;
  let gasUsd = 0;
  let rowId: string | null = null;
  try {
    const params = await buildParams({ chain, stock, combo: v.display, ...(meme ?? {}), creator, curve: { ...CURVE_DEFAULTS, mcapStart }, stockPriceUsd });
    const sdk = new DopplerSDK({ publicClient, chainId: chain.chainId });
    const [prepared, gasPrice] = await Promise.all([sdk.factory.prepareCreateMulticurve(params, { account: account.address }), publicClient.getGasPrice()]);
    const gas = prepared.gasEstimate.status === "estimated" ? prepared.gasEstimate.gas : 3_500_000n;
    const estUsd = Number(formatEther((gas * gasPrice * 12n) / 10n)) * (ethUsd || 0);
    if (ethUsd > 0 && estUsd > MAX_GAS_USD_PER_LAUNCH) return { ok: false, error: `gas looks too high right now ($${estUsd.toFixed(2)}), try later`, code: "SPONSOR_GAS", status: 503 };
    if (ethUsd > 0 && estUsd > status.remainingUsd) return { ok: false, error: "the sponsor budget cannot cover this launch", code: "SPONSOR_BUDGET", status: 429 };

    // Claim the budget slot first so two requests cannot both spend the last dollar.
    const { data: row, error: rowErr } = await sb.from("sponsored_launches").insert({ network: NETWORK, creator: creator.toLowerCase(), combo: v.display, chain_id: chain.chainId, pair: stock.address, gas_usd: estUsd, status: "pending" }).select("id").single();
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? "could not reserve", code: "DB_ERROR", status: 500 };
    rowId = (row as { id: string }).id;

    const wallet = createWalletClient({ account, chain: chain.viem, transport: transportFor(chain.viem) });
    txHash = await wallet.sendTransaction({ to: prepared.transaction.to, data: prepared.transaction.data, value: prepared.transaction.value, gas: (gas * 12n) / 10n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    gasUsd = Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)) * (ethUsd || 0);
    if (receipt.status !== "success") {
      await sb.from("sponsored_launches").update({ status: "failed", tx_hash: txHash, gas_usd: gasUsd, reason: "reverted" }).eq("id", rowId);
      return { ok: false, error: "the launch transaction reverted", code: "TX_NOT_VERIFIED", status: 422 };
    }
    await sb.from("sponsored_launches").update({ status: "sent", tx_hash: txHash, gas_usd: gasUsd, token_address: prepared.prediction.tokenAddress }).eq("id", rowId);

    const proof = await verifyLaunchTx({ chainId: chain.chainId, txHash, tokenAddress: prepared.prediction.tokenAddress, creatorAddress: creator, numeraire: stock.address, sender: account.address });
    if (!proof.ok) return { ok: false, error: `Launch not verified on-chain: ${proof.reason}`, code: "TX_NOT_VERIFIED", status: 422 };
    const rec = await recordLaunch({ v, meme, chain, stock, tokenAddress: prepared.prediction.tokenAddress, poolId: prepared.prediction.poolId, txHash, supply: String(CURVE_DEFAULTS.supply), creatorAddress: creator, who: { kind: "agent", did: null, handle: null }, sponsor: account.address });
    if (!rec.ok) return rec;
    return { ok: true, txHash, gasUsd, moji: rec.moji, href: rec.href, url: rec.url };
  } catch (e) {
    const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    if (rowId) await sb.from("sponsored_launches").update({ status: "failed", reason: msg.slice(0, 240) }).eq("id", rowId);
    return { ok: false, error: `Sponsored launch failed: ${msg.split("\n")[0].slice(0, 240)}`, code: "SPONSOR_FAILED", status: 502 };
  }
}
