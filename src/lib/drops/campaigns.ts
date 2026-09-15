import "server-only";
import { createWalletClient, decodeEventLog, formatUnits, isAddress, parseUnits, verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainById } from "@/config/chains";
import { publicClientFor, transportFor } from "@/lib/rpc";
import { stockPriceServer } from "@/lib/market";
import { findNumeraire } from "@/lib/numeraire";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { MOJI_DROPS_ABI, campaignKey, dropsContract } from "./contract";
import { computeRound, type RoundResult } from "./rounds";
import { scanHolders } from "./holders";
import { CAMPAIGN_LIMITS, canonicalRulesMessage, type CampaignRow, type CampaignRules, type PayoutRow, type RoundRow } from "./types";

const DAY = 86_400_000;

export function operatorConfigured(): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(process.env.DROPS_OPERATOR_PRIVATE_KEY ?? "");
}

function operator(chainId: number) {
  const chain = chainById(chainId)?.viem;
  const pk = process.env.DROPS_OPERATOR_PRIVATE_KEY as Hex | undefined;
  if (!chain || !pk || !operatorConfigured()) return null;
  const account = privateKeyToAccount(pk);
  return { account, chain, wallet: createWalletClient({ chain, account, transport: transportFor(chain) }), pc: publicClientFor(chain) };
}

/** USD price of the token a campaign pays in. Moji from the 2-minute snapshot, stock from the live feed. */
export async function campaignTokenPrice(m: MojiRow, kind: "moji" | "stock"): Promise<number> {
  if (kind === "moji") return Number(m.price_usd ?? 0);
  return stockPriceServer(m.chain_id, m.stock_address, m.stock_ticker);
}

export function tokenFor(m: MojiRow, kind: "moji" | "stock"): { address: Address; decimals: number; symbol: string } {
  if (kind === "moji") return { address: m.token_address as Address, decimals: 18, symbol: m.display };
  const s = findNumeraire(m.chain_id, m.stock_address);
  return { address: m.stock_address as Address, decimals: s?.decimals ?? 18, symbol: m.stock_ticker };
}

/** Validate the rules a creator submitted. Returns the normalized rules or a message for the form. */
export function validateRules(m: MojiRow, input: Partial<CampaignRules>): { ok: true; rules: CampaignRules } | { ok: false; error: string } {
  const L = CAMPAIGN_LIMITS;
  const int = (v: unknown, lo: number, hi: number, name: string): number | string => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) return `${name} must be a whole number between ${lo} and ${hi}`;
    return n;
  };
  if (!m.token_address) return { ok: false, error: "this moji has no token yet" };
  if (input.token !== "moji" && input.token !== "stock") return { ok: false, error: "pick what to give: the moji or the stock" };
  const t = tokenFor(m, input.token);
  const amountStr = String(input.amount ?? "").trim();
  let amountWei: bigint;
  try {
    amountWei = parseUnits(amountStr, t.decimals);
  } catch {
    return { ok: false, error: "amount is not a number" };
  }
  if (amountWei <= 0n) return { ok: false, error: "amount must be more than zero" };
  const topN = int(input.topN, L.topN.min, L.topN.max, "top holders");
  if (typeof topN === "string") return { ok: false, error: topN };
  const days = int(input.days, L.days.min, L.days.max, "days");
  if (typeof days === "string") return { ok: false, error: days };
  const holdDays = int(input.holdDays, L.holdDays.min, L.holdDays.max, "hold days");
  if (typeof holdDays === "string") return { ok: false, error: holdDays };
  const capBps = int(input.capBps ?? 500, L.capBps.min, L.capBps.max, "cap");
  if (typeof capBps === "string") return { ok: false, error: capBps };
  const cutHourUtc = int(input.cutHourUtc ?? 9, 0, 23, "payout hour");
  if (typeof cutHourUtc === "string") return { ok: false, error: cutHourUtc };
  const minPayoutUsd = Number(input.minPayoutUsd ?? 2);
  if (!isFinite(minPayoutUsd) || minPayoutUsd < L.minPayoutUsd.min || minPayoutUsd > L.minPayoutUsd.max) return { ok: false, error: "minimum payout must be between $0 and $1000" };
  const minHoldStr = String(input.minHold ?? "0").trim() || "0";
  try {
    if (parseUnits(minHoldStr, 18) < 0n) throw new Error();
  } catch {
    return { ok: false, error: "minimum holding is not a number" };
  }
  const split = input.split === "equal" ? "equal" : "prorata";
  const excluded = [...new Set((input.excluded ?? []).map((a) => String(a).trim().toLowerCase()).filter((a) => isAddress(a)))];
  return {
    ok: true,
    rules: { v: 1, moji: m.display, mojiId: m.id, chainId: m.chain_id, token: input.token, tokenAddress: t.address.toLowerCase(), amount: amountStr, topN, days, holdDays, minHold: minHoldStr, minPayoutUsd, split, capBps, cutHourUtc, excluded },
  };
}

/** Create a draft row from signed rules. The signature must come from the moji's creator wallet. */
export async function createDraft(m: MojiRow, rules: CampaignRules, signature: Hex, signer: Address): Promise<CampaignRow> {
  if (!m.creator_address || signer.toLowerCase() !== m.creator_address.toLowerCase()) throw new Error("only the wallet that launched this moji can start a drop");
  const message = canonicalRulesMessage(rules);
  const ok = await verifyMessage({ address: signer, message, signature });
  if (!ok) throw new Error("signature does not match the rules");
  if (!dropsContract(m.chain_id)) throw new Error("drops are not deployed on this chain yet");
  const t = tokenFor(m, rules.token);
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("drop_campaigns")
    .insert({
      moji_id: m.id,
      chain_id: m.chain_id,
      network: NETWORK,
      creator_address: signer.toLowerCase(),
      token_kind: rules.token,
      token_address: t.address.toLowerCase(),
      token_decimals: t.decimals,
      token_symbol: t.symbol,
      amount: Number(rules.amount),
      amount_wei: parseUnits(rules.amount, t.decimals).toString(),
      top_n: rules.topN,
      days: rules.days,
      hold_days: rules.holdDays,
      min_hold: Number(rules.minHold),
      min_hold_wei: parseUnits(rules.minHold, 18).toString(),
      min_payout_usd: rules.minPayoutUsd,
      split: rules.split,
      cap_bps: rules.capBps,
      cut_hour_utc: rules.cutHourUtc,
      excluded: rules.excluded,
      signed_message: message,
      signature,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignRow;
}

/** First cut: the next `cutHourUtc` that is at least 1 hour away, so a campaign funded at 08:59 does not pay at 09:00 on stale data. */
export function firstCut(from: Date, cutHourUtc: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), cutHourUtc, 0, 0, 0));
  while (d.getTime() < from.getTime() + 3_600_000) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Confirm funding from the receipt: the tx must have emitted CampaignFunded from our escrow, for this
 * campaign's key, from the creator, for this token and at least this amount. Then the campaign runs.
 */
export async function confirmFunded(c: CampaignRow, m: MojiRow, txHash: Hex): Promise<CampaignRow> {
  const chain = chainById(c.chain_id)?.viem;
  const escrow = dropsContract(c.chain_id);
  if (!chain || !escrow) throw new Error("drops are not deployed on this chain");
  if (c.status !== "draft") return c;
  const pc = publicClientFor(chain);
  const receipt = await pc.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("the funding transaction failed");
  const key = campaignKey(c.id).toLowerCase();
  let found: { id: bigint; amount: bigint; reclaimAfter: bigint } | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: MOJI_DROPS_ABI, data: log.data, topics: log.topics });
      if (ev.eventName !== "CampaignFunded") continue;
      const a = ev.args as unknown as { id: bigint; creator: Address; token: Address; amount: bigint; reclaimAfter: bigint; key: Hex };
      if (a.key.toLowerCase() !== key) continue;
      if (a.creator.toLowerCase() !== c.creator_address.toLowerCase()) throw new Error("funded from a different wallet");
      if (a.token.toLowerCase() !== c.token_address.toLowerCase()) throw new Error("funded with a different token");
      if (a.amount < BigInt(c.amount_wei)) throw new Error("funded amount is less than the campaign amount");
      found = { id: a.id, amount: a.amount, reclaimAfter: a.reclaimAfter };
    } catch (e) {
      if (e instanceof Error && /different|less than/.test(e.message)) throw e;
    }
  }
  if (!found) throw new Error("no CampaignFunded event for this campaign in that transaction");
  const now = new Date();
  const first = firstCut(now, c.cut_hour_utc);
  const ends = new Date(first.getTime() + (c.days - 1) * DAY);
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("drop_campaigns")
    .update({
      status: "running",
      onchain_id: Number(found.id),
      fund_tx: txHash,
      funded_at: now.toISOString(),
      amount_wei: found.amount.toString(),
      amount: Number(formatUnits(found.amount, c.token_decimals)),
      starts_at: first.toISOString(),
      ends_at: ends.toISOString(),
      reclaim_after: new Date(Number(found.reclaimAfter) * 1000).toISOString(),
      next_cut_at: first.toISOString(),
    })
    .eq("id", c.id)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await sb.from("mojis").update({ drops_active: true }).eq("id", m.id);
  return data as CampaignRow;
}

/** What the next round would pay right now, for the form preview and the public card. */
export async function previewRound(m: MojiRow, c: Pick<CampaignRow, "token_kind" | "token_decimals" | "top_n" | "hold_days" | "min_hold_wei" | "min_payout_usd" | "split" | "cap_bps" | "excluded">, potWei: bigint): Promise<RoundResult> {
  const price = await campaignTokenPrice(m, c.token_kind);
  return computeRound(
    m,
    { topN: c.top_n, holdDays: c.hold_days, minHoldWei: BigInt(c.min_hold_wei), minPayoutUsd: Number(c.min_payout_usd), split: c.split, capBps: c.cap_bps, excluded: c.excluded ?? [], tokenDecimals: c.token_decimals },
    potWei,
    price,
  );
}

export function roundPot(c: CampaignRow): bigint {
  const remaining = BigInt(c.amount_wei) - BigInt(c.paid_wei);
  const roundsLeft = Math.max(1, c.days - c.rounds_paid);
  return roundsLeft === 1 ? remaining : remaining / BigInt(roundsLeft);
}

/**
 * Pay every round that is due. One campaign at a time; a failure is recorded on the round and the
 * campaign waits for the next tick rather than skipping a day.
 */
export async function cutDueRounds(limit = 20): Promise<{ cut: number; failed: number; errors: string[] }> {
  const sb = supabaseServer();
  const nowIso = new Date().toISOString();
  const { data } = await sb.from("drop_campaigns").select("*").eq("status", "running").lte("next_cut_at", nowIso).order("next_cut_at", { ascending: true }).limit(limit);
  const due = (data ?? []) as CampaignRow[];
  let cut = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const c of due) {
    try {
      const { data: mrow } = await sb.from("mojis").select("*").eq("id", c.moji_id).single();
      const m = mrow as MojiRow;
      await scanHolders(m, { maxChunks: 20 }); // bring balances to the head before ranking
      const fresh = (await sb.from("mojis").select("*").eq("id", c.moji_id).single()).data as MojiRow;
      await cutRound(c, fresh);
      cut++;
    } catch (e) {
      failed++;
      errors.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { cut, failed, errors };
}

async function cutRound(c: CampaignRow, m: MojiRow): Promise<void> {
  const sb = supabaseServer();
  const op = operator(c.chain_id);
  const escrow = dropsContract(c.chain_id);
  if (!op || !escrow) throw new Error("operator or escrow not configured");
  const roundNo = c.rounds_paid + 1;
  const cutAt = new Date(c.next_cut_at ?? Date.now());
  const pot = roundPot(c);
  const res = await previewRound(m, c, pot);
  const { data: existing } = await sb.from("drop_rounds").select("id, status").eq("campaign_id", c.id).eq("round_no", roundNo).maybeSingle();
  if (existing && (existing as { status: string }).status === "paid") return; // already done (a retry after a partial failure)

  const base = {
    campaign_id: c.id,
    moji_id: c.moji_id,
    round_no: roundNo,
    cut_at: cutAt.toISOString(),
    pot_wei: pot.toString(),
    eligible: res.eligible,
    recipients: res.payouts.length,
    threshold_wei: res.thresholdWei?.toString() ?? null,
    token_price_usd: res.tokenPriceUsd,
  };
  const { data: roundRow, error: rErr } = await sb.from("drop_rounds").upsert({ ...base, status: "pending", error: null }, { onConflict: "campaign_id,round_no" }).select("*").single();
  if (rErr) throw new Error(rErr.message);
  const round = roundRow as RoundRow;

  const nextCut = new Date(cutAt.getTime() + DAY);
  const lastRound = roundNo >= c.days;

  if (res.payouts.length === 0) {
    // nobody qualifies today: the pot rolls into the remaining rounds; on the last day it goes back to the creator
    await sb.from("drop_rounds").update({ status: "skipped", error: res.belowFloor > 0 ? `${res.belowFloor} wallets under the $${c.min_payout_usd} floor` : "no holders met the rules" }).eq("id", round.id);
    await finishRound(c, m, { roundNo, paidWei: 0n, paidUsd: 0, nextCut, lastRound, op, escrow });
    return;
  }

  const recipients = res.payouts.map((p) => p.address as Address);
  const amounts = res.payouts.map((p) => p.amountWei);
  let txHash: Hex;
  try {
    const { request } = await op.pc.simulateContract({ address: escrow, abi: MOJI_DROPS_ABI, functionName: "payRound", args: [BigInt(c.onchain_id ?? 0), recipients, amounts], account: op.account });
    txHash = await op.wallet.writeContract(request);
  } catch (e) {
    const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    await sb.from("drop_rounds").update({ status: "failed", error: msg.slice(0, 300) }).eq("id", round.id);
    throw new Error(msg);
  }
  const receipt = await op.pc.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    await sb.from("drop_rounds").update({ status: "failed", tx_hash: txHash, error: "payRound reverted" }).eq("id", round.id);
    throw new Error("payRound reverted");
  }
  let paidWei = 0n;
  let skipped = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: MOJI_DROPS_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "RoundPaid") {
        const a = ev.args as unknown as { total: bigint; recipients: bigint; skipped: bigint };
        paidWei = a.total;
        skipped = Number(a.skipped);
      }
    } catch {}
  }
  const paidUsd = Number(formatUnits(paidWei, c.token_decimals)) * res.tokenPriceUsd;
  const payoutRows: PayoutRow[] = res.payouts.map((p) => ({
    round_id: round.id,
    campaign_id: c.id,
    moji_id: c.moji_id,
    address: p.address,
    rank: p.rank,
    held_wei: p.heldWei.toString(),
    amount_wei: p.amountWei.toString(),
    amount_usd: p.amountUsd,
  }));
  for (let i = 0; i < payoutRows.length; i += 500) await sb.from("drop_payouts").upsert(payoutRows.slice(i, i + 500), { onConflict: "round_id,address" });
  await sb.from("drop_rounds").update({ status: "paid", tx_hash: txHash, paid_wei: paidWei.toString(), paid_usd: paidUsd, skipped, block: String(receipt.blockNumber) }).eq("id", round.id);
  await finishRound(c, m, { roundNo, paidWei, paidUsd, nextCut, lastRound, op, escrow });
}

async function finishRound(
  c: CampaignRow,
  m: MojiRow,
  x: { roundNo: number; paidWei: bigint; paidUsd: number; nextCut: Date; lastRound: boolean; op: NonNullable<ReturnType<typeof operator>>; escrow: Address },
): Promise<void> {
  const sb = supabaseServer();
  const patch: Record<string, unknown> = {
    rounds_paid: x.roundNo,
    paid_wei: (BigInt(c.paid_wei) + x.paidWei).toString(),
    paid_usd: Number(c.paid_usd) + x.paidUsd,
    next_cut_at: x.lastRound ? null : x.nextCut.toISOString(),
  };
  if (x.lastRound) {
    // return whatever is left to the creator and close the campaign
    try {
      const { request } = await x.op.pc.simulateContract({ address: x.escrow, abi: MOJI_DROPS_ABI, functionName: "end", args: [BigInt(c.onchain_id ?? 0)], account: x.op.account });
      const h = await x.op.wallet.writeContract(request);
      await x.op.pc.waitForTransactionReceipt({ hash: h });
      patch.end_tx = h;
      patch.status = "done";
    } catch (e) {
      // the creator can still reclaim after reclaim_after; keep the row visible as done-but-unreturned
      patch.status = "done";
      patch.end_tx = null;
      console.error("drops end() failed", c.id, e instanceof Error ? e.message : e);
    }
  }
  await sb.from("drop_campaigns").update(patch).eq("id", c.id);
  const { count } = await sb.from("drop_campaigns").select("id", { count: "exact", head: true }).eq("moji_id", m.id).eq("status", "running");
  await sb
    .from("mojis")
    .update({ drops_active: (count ?? 0) > 0, drops_paid_usd: Number(m.drops_paid_usd ?? 0) + x.paidUsd })
    .eq("id", m.id);
}

/** Campaigns for a moji, newest first. */
export async function listCampaigns(mojiId: string): Promise<CampaignRow[]> {
  const { data } = await supabaseServer().from("drop_campaigns").select("*").eq("moji_id", mojiId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as CampaignRow[];
}

export async function listRounds(mojiId: string, limit = 30): Promise<RoundRow[]> {
  const { data } = await supabaseServer().from("drop_rounds").select("*").eq("moji_id", mojiId).order("cut_at", { ascending: false }).limit(limit);
  return (data ?? []) as RoundRow[];
}

/** What one wallet received from a moji's drops. */
export async function payoutsFor(mojiId: string, address: string, limit = 30): Promise<(PayoutRow & { cut_at?: string })[]> {
  const { data } = await supabaseServer().from("drop_payouts").select("*, drop_rounds!inner(cut_at, status)").eq("moji_id", mojiId).eq("address", address.toLowerCase()).order("rank", { ascending: true }).limit(limit);
  return ((data ?? []) as (PayoutRow & { drop_rounds?: { cut_at: string } })[]).map((p) => ({ ...p, cut_at: p.drop_rounds?.cut_at }));
}

/** A future deploy: `npm run drops:deploy`. Exposed so the script and the app share one ABI. */
export { MOJI_DROPS_ABI };
