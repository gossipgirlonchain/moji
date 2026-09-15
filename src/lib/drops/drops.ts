import "server-only";
import { decodeEventLog, formatUnits, isAddress, parseAbi, parseUnits, verifyMessage, type Address, type Hex } from "viem";
import { chainById } from "@/config/chains";
import { publicClientFor } from "@/lib/rpc";
import { stockPriceServer } from "@/lib/market";
import { findNumeraire } from "@/lib/numeraire";
import { supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { dropsFeeBps, dropsFeeRecipient, feeFor } from "./contract";
import { computeRound, type RoundResult } from "./rounds";
import { DROP_LIMITS, canonicalRulesMessage, type DropRow, type DropRules, type PayoutRow } from "./types";

const TRANSFER_ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const ACTIVE_DAYS = 14;

/** USD price of the token a drop pays in. Moji from the 2-minute snapshot, stock from the live feed. */
export async function dropTokenPrice(m: MojiRow, kind: "moji" | "stock"): Promise<number> {
  if (kind === "moji") return Number(m.price_usd ?? 0);
  return stockPriceServer(m.chain_id, m.stock_address, m.stock_ticker);
}

export function tokenFor(m: MojiRow, kind: "moji" | "stock"): { address: Address; decimals: number; symbol: string } {
  if (kind === "moji") return { address: m.token_address as Address, decimals: 18, symbol: m.display };
  const s = findNumeraire(m.chain_id, m.stock_address);
  return { address: m.stock_address as Address, decimals: s?.decimals ?? 18, symbol: m.stock_ticker };
}

/** Validate the rules a creator submitted. Returns the normalized rules or a message for the form. */
export function validateRules(m: MojiRow, input: Partial<DropRules>): { ok: true; rules: DropRules } | { ok: false; error: string } {
  const L = DROP_LIMITS;
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
  const holdDays = int(input.holdDays, L.holdDays.min, L.holdDays.max, "hold days");
  if (typeof holdDays === "string") return { ok: false, error: holdDays };
  const capBps = int(input.capBps ?? 500, L.capBps.min, L.capBps.max, "cap");
  if (typeof capBps === "string") return { ok: false, error: capBps };
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
    rules: { v: 2, moji: m.display, mojiId: m.id, chainId: m.chain_id, token: input.token, tokenAddress: t.address.toLowerCase(), amount: amountStr, topN, holdDays, minHold: minHoldStr, minPayoutUsd, split, capBps, excluded },
  };
}

/** Rank holders for these rules right now. Used by the preview and by createDrop. */
export async function previewDrop(m: MojiRow, r: DropRules): Promise<{ res: RoundResult; amountWei: bigint; decimals: number }> {
  const t = tokenFor(m, r.token);
  const amountWei = parseUnits(r.amount, t.decimals);
  const price = await dropTokenPrice(m, r.token);
  const res = await computeRound(
    m,
    { topN: r.topN, holdDays: r.holdDays, minHoldWei: parseUnits(r.minHold, 18), minPayoutUsd: r.minPayoutUsd, split: r.split, capBps: r.capBps, excluded: r.excluded, tokenDecimals: t.decimals },
    amountWei,
    price,
  );
  return { res, amountWei, decimals: t.decimals };
}

/**
 * Create a drop from signed rules and cut the ranking now. The creator then sends one plain transfer per
 * payout from their own wallet; `recordSent` confirms each from its receipt.
 */
export async function createDrop(m: MojiRow, rules: DropRules, signature: Hex, signer: Address): Promise<{ drop: DropRow; payouts: PayoutRow[] }> {
  if (!m.creator_address || signer.toLowerCase() !== m.creator_address.toLowerCase()) throw new Error("only the wallet that launched this moji can drop to its holders");
  const message = canonicalRulesMessage(rules);
  const ok = await verifyMessage({ address: signer, message, signature });
  if (!ok) throw new Error("signature does not match the rules");
  const t = tokenFor(m, rules.token);
  const { res, amountWei } = await previewDrop(m, rules);
  if (res.payouts.length === 0) throw new Error(res.eligible > 0 ? `every payout is under the $${rules.minPayoutUsd} floor` : "nobody meets the hold rules right now");
  const feeBps = dropsFeeBps();
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("drops")
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
      amount_wei: amountWei.toString(),
      fee_bps: feeBps,
      fee_wei: feeFor(res.paidWei, feeBps).toString(),
      top_n: rules.topN,
      hold_days: rules.holdDays,
      min_hold: Number(rules.minHold),
      min_hold_wei: parseUnits(rules.minHold, 18).toString(),
      min_payout_usd: rules.minPayoutUsd,
      split: rules.split,
      cap_bps: rules.capBps,
      excluded: rules.excluded,
      signed_message: message,
      signature,
      cut_at: new Date().toISOString(),
      eligible: res.eligible,
      recipients: res.payouts.length,
      threshold_wei: res.thresholdWei?.toString() ?? null,
      token_price_usd: res.tokenPriceUsd,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const drop = data as DropRow;
  const rows = res.payouts.map((p) => ({
    drop_id: drop.id,
    moji_id: m.id,
    address: p.address,
    rank: p.rank,
    held_wei: p.heldWei.toString(),
    amount_wei: p.amountWei.toString(),
    amount_usd: p.amountUsd,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: pe } = await sb.from("drop_payouts").insert(rows.slice(i, i + 500));
    if (pe) throw new Error(pe.message);
  }
  return { drop, payouts: await listPayouts(drop.id) };
}

/**
 * Confirm transfers from receipts. Any Transfer of the drop's token from the creator to a pending payout
 * address for at least its amount marks that payout sent; a Transfer to the treasury for at least the fee
 * marks the fee paid. Client-side numbers are never trusted.
 */
export async function recordSent(m: MojiRow, drop: DropRow, txHashes: Hex[]): Promise<{ drop: DropRow; confirmed: number; feePaid: boolean }> {
  const chain = chainById(drop.chain_id)?.viem;
  if (!chain) throw new Error("unsupported chain");
  const pc = publicClientFor(chain);
  const sb = supabaseServer();
  const pending = await listPayouts(drop.id, { pendingOnly: true });
  const byAddr = new Map(pending.map((p) => [p.address, p]));
  const feeTo = dropsFeeRecipient()?.toLowerCase();
  const feeWei = BigInt(drop.fee_wei);
  let confirmed = 0;
  let feePaid = Boolean(drop.fee_tx);
  let sentWei = 0n;
  let sentUsd = 0;
  for (const hash of txHashes) {
    const receipt = await pc.getTransactionReceipt({ hash }).catch(() => null);
    if (!receipt || receipt.status !== "success") continue;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== drop.token_address.toLowerCase()) continue;
      let ev;
      try {
        ev = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
      } catch {
        continue;
      }
      const { from, to, value } = ev.args as { from: Address; to: Address; value: bigint };
      if (from.toLowerCase() !== drop.creator_address.toLowerCase()) continue;
      const toL = to.toLowerCase();
      const p = byAddr.get(toL);
      if (p && value >= BigInt(p.amount_wei)) {
        const { error } = await sb.from("drop_payouts").update({ tx_hash: hash, sent_at: new Date().toISOString(), error: null }).eq("drop_id", drop.id).eq("address", toL).is("tx_hash", null);
        if (!error) {
          byAddr.delete(toL);
          confirmed++;
          sentWei += BigInt(p.amount_wei);
          sentUsd += Number(p.amount_usd);
        }
      } else if (!feePaid && feeTo && toL === feeTo && feeWei > 0n && value >= feeWei) {
        await sb.from("drops").update({ fee_tx: hash }).eq("id", drop.id);
        feePaid = true;
      }
    }
  }
  const remaining = byAddr.size;
  const sentCount = drop.sent_count + confirmed;
  const done = remaining === 0 && (feePaid || feeWei === 0n);
  const patch: Record<string, unknown> = {
    sent_count: sentCount,
    sent_wei: (BigInt(drop.sent_wei) + sentWei).toString(),
    sent_usd: Number(drop.sent_usd) + sentUsd,
    status: done ? "sent" : "sending",
    completed_at: done ? new Date().toISOString() : null,
  };
  const { data } = await sb.from("drops").update(patch).eq("id", drop.id).select("*").single();
  const updated = (data as DropRow) ?? { ...drop, ...patch };
  if (confirmed > 0 || done) await refreshMojiDropStats(m);
  return { drop: updated, confirmed, feePaid };
}

/** A draft or partly sent drop can be closed; what was sent stays recorded, the rest is simply not sent. */
export async function cancelDrop(drop: DropRow): Promise<DropRow> {
  if (drop.status === "sent") return drop;
  const { data } = await supabaseServer().from("drops").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", drop.id).select("*").single();
  return (data as DropRow) ?? drop;
}

/** drops_active / drops_last_at / drops_paid_usd on the moji row, from what has actually been sent. */
export async function refreshMojiDropStats(m: MojiRow): Promise<void> {
  const sb = supabaseServer();
  const { data } = await sb.from("drops").select("sent_usd, completed_at, cut_at, sent_count").eq("moji_id", m.id).gt("sent_count", 0);
  const rows = (data ?? []) as { sent_usd: number; completed_at: string | null; cut_at: string; sent_count: number }[];
  const paid = rows.reduce((s, r) => s + Number(r.sent_usd ?? 0), 0);
  const last = rows.map((r) => r.completed_at ?? r.cut_at).sort().pop() ?? null;
  const active = last ? Date.now() - new Date(last).getTime() < ACTIVE_DAYS * 86_400_000 : false;
  await sb.from("mojis").update({ drops_paid_usd: paid, drops_last_at: last, drops_active: active }).eq("id", m.id);
}

/** Cron helper: clear the 🪂 pill on mojis whose last drop is older than the active window. */
export async function expireDropsActive(): Promise<number> {
  const sb = supabaseServer();
  const cutoff = new Date(Date.now() - ACTIVE_DAYS * 86_400_000).toISOString();
  const { data } = await sb.from("mojis").update({ drops_active: false }).eq("drops_active", true).lt("drops_last_at", cutoff).select("id");
  return (data ?? []).length;
}

export async function listDrops(mojiId: string, limit = 20): Promise<DropRow[]> {
  const { data } = await supabaseServer().from("drops").select("*").eq("moji_id", mojiId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as DropRow[];
}

export async function getDrop(id: string, mojiId: string): Promise<DropRow | null> {
  const { data } = await supabaseServer().from("drops").select("*").eq("id", id).eq("moji_id", mojiId).maybeSingle();
  return (data as DropRow) ?? null;
}

export async function listPayouts(dropId: string, opts: { pendingOnly?: boolean } = {}): Promise<PayoutRow[]> {
  let p = supabaseServer().from("drop_payouts").select("*").eq("drop_id", dropId).order("rank", { ascending: true }).limit(5000);
  if (opts.pendingOnly) p = p.is("tx_hash", null);
  const { data } = await p;
  return (data ?? []) as PayoutRow[];
}

/** What one wallet has received from a moji's drops (sent ones only). */
export async function payoutsFor(mojiId: string, address: string, limit = 30): Promise<(PayoutRow & { token_symbol?: string; token_decimals?: number })[]> {
  const { data } = await supabaseServer()
    .from("drop_payouts")
    .select("*, drops!inner(token_symbol, token_decimals, status)")
    .eq("moji_id", mojiId)
    .eq("address", address.toLowerCase())
    .not("tx_hash", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as (PayoutRow & { drops?: { token_symbol: string; token_decimals: number } })[]).map((p) => ({ ...p, token_symbol: p.drops?.token_symbol, token_decimals: p.drops?.token_decimals }));
}

export function fmtUnits(wei: string | bigint, decimals: number): string {
  return formatUnits(typeof wei === "bigint" ? wei : BigInt(wei), decimals);
}
