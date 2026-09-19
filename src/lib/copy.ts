import "server-only";
import { erc20Abi, parseEther, parseUnits, type Address, type Hex } from "viem";
import { supabaseServer, hasSupabase, type MojiRow } from "./supabase";
import { NETWORK } from "./network";
import { feed, type FeedItem } from "./feed";
import type { FollowRow } from "./follows";
import { DELEGATION_CONFIGURED, delegatedWallet, delegationFor, sendFromDelegated, type Delegation } from "./delegated";
import { buildTrade, TradeError } from "./trade";
import { nativePriceUsd, stockPriceServer } from "./market";
import { chainById } from "@/config/chains";
import { findNumeraire } from "./numeraire";
import { publicClientFor } from "./rpc";

/**
 * The copy engine. Every run: for each follow with `copy` on, look at what the followed agent bought or sold in
 * the last LOOKBACK, and for each swap not yet copied, send the follower's version from their delegated wallet,
 * inside the rules on the follow (max per trade, max per day, only these pairs, min holders).
 *
 *  - A buy copies the agent's USD size, capped by the rules, paid in ETH when the chain has an ETH route to the
 *    pair and in the paired stock otherwise. A sell mirrors fully: the follower sells everything they hold of
 *    that moji (they copied in, they copy out); max per trade does not apply to sells.
 *  - One row in copy_trades per (follow, source swap), inserted before anything is sent; the unique index is
 *    what stops a double send across overlapping runs.
 *  - Gas comes from the follower's wallet; a wallet under GAS_RESERVE is skipped, never drained.
 */
const LOOKBACK_S = 15 * 60;
const MAX_PER_RUN = 10;
const GAS_RESERVE = parseEther("0.0002");

export type CopyRunResult = { configured: boolean; follows: number; considered: number; sent: number; skipped: number; failed: number; notes: string[] };

type CopyFollow = FollowRow;

function todayUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function runCopy(opts: { budgetMs?: number } = {}): Promise<CopyRunResult> {
  const out: CopyRunResult = { configured: DELEGATION_CONFIGURED, follows: 0, considered: 0, sent: 0, skipped: 0, failed: 0, notes: [] };
  if (!DELEGATION_CONFIGURED || !hasSupabase()) return out;
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 200_000;
  const sb = supabaseServer();

  const { data: fdata } = await sb.from("follows").select("*").eq("network", NETWORK).eq("copy", true).gt("max_per_trade_usd", 0);
  const follows = (fdata ?? []) as CopyFollow[];
  out.follows = follows.length;
  if (follows.length === 0) return out;

  // Followers must have a delegated wallet we know about, still delegated according to Privy.
  const delegations = new Map<string, Delegation | null>();
  for (const f of follows) {
    if (delegations.has(f.follower)) continue;
    const d = await delegationFor(f.follower);
    if (d) {
      const live = await delegatedWallet(d.did);
      delegations.set(f.follower, live && live.address === d.address ? d : null);
    } else delegations.set(f.follower, null);
  }
  const active = follows.filter((f) => delegations.get(f.follower));
  if (active.length === 0) return out;

  const since = Math.floor(Date.now() / 1000) - LOOKBACK_S;
  const byFollowee = new Map<string, CopyFollow[]>();
  for (const f of active) byFollowee.set(f.followee, [...(byFollowee.get(f.followee) ?? []), f]);

  const candidates: { f: CopyFollow; item: FeedItem }[] = [];
  for (const [followee, fs] of byFollowee) {
    const items = await feed({ actor: followee, kinds: ["buy", "sell"], since, limit: 50 });
    for (const item of items) for (const f of fs) if (item.actor.address?.toLowerCase() !== f.follower) candidates.push({ f, item });
  }
  out.considered = candidates.length;
  if (candidates.length === 0) return out;

  // Already handled?
  const { data: done } = await sb.from("copy_trades").select("follow_id, source_tx").in("source_tx", [...new Set(candidates.map((c) => c.item.tx!))]);
  const doneSet = new Set(((done ?? []) as { follow_id: string; source_tx: string }[]).map((r) => `${r.follow_id}:${r.source_tx}`));

  const ethUsd = await nativePriceUsd("ETH").catch(() => 0);
  let n = 0;
  for (const { f, item } of candidates) {
    if (Date.now() - t0 > budget || n >= MAX_PER_RUN) break;
    if (doneSet.has(`${f.id}:${item.tx}`)) continue;
    const d = delegations.get(f.follower)!;
    const { data: mrow } = await sb.from("mojis").select("*").eq("network", NETWORK).eq("chain_id", item.moji.chainId).ilike("token_address", item.moji.tokenAddress ?? "").maybeSingle();
    const m = mrow as MojiRow | null;
    if (!m) continue;

    // Claim the slot first; a conflict means another run has it.
    const { data: claimed, error: claimErr } = await sb.from("copy_trades").insert({ network: NETWORK, follow_id: f.id, follower: f.follower, followee: f.followee, moji_id: m.id, source_tx: item.tx, side: item.kind, usd: 0 }).select("id").single();
    if (claimErr || !claimed) continue;
    const id = (claimed as { id: string }).id;
    const finish = async (status: "sent" | "skipped" | "failed", patch: Record<string, unknown>) => {
      await sb.from("copy_trades").update({ status, ...patch }).eq("id", id);
      if (status === "sent") out.sent++;
      else if (status === "skipped") out.skipped++;
      else out.failed++;
    };
    n++;

    // Rules.
    if (f.pairs && !f.pairs.includes(m.stock_ticker.toUpperCase())) {
      await finish("skipped", { reason: `pair ${m.stock_ticker} not in the follow's list` });
      continue;
    }
    if (f.min_holders > 0 && Number(m.holders_count ?? 0) < f.min_holders) {
      await finish("skipped", { reason: `${m.holders_count ?? 0} holders, rule wants ${f.min_holders}` });
      continue;
    }
    const chain = chainById(m.chain_id);
    if (!chain?.viem) {
      await finish("skipped", { reason: "chain not live" });
      continue;
    }
    const pc = publicClientFor(chain.viem);
    const from = d.address as Address;
    const ethBal = await pc.getBalance({ address: from });
    if (ethBal < GAS_RESERVE) {
      await finish("skipped", { reason: "not enough ETH for gas" });
      continue;
    }

    try {
      let side: "buy" | "sell" = item.kind === "buy" ? "buy" : "sell";
      let usd = 0;
      let amountIn = 0n;
      let via: "eth" | "stock" = "eth";
      if (side === "buy") {
        const { data: spent } = await sb.from("copy_trades").select("usd").eq("follow_id", f.id).gte("created_at", todayUtc()).neq("status", "failed").neq("status", "skipped");
        const spentToday = ((spent ?? []) as { usd: number }[]).reduce((s, r) => s + Number(r.usd ?? 0), 0);
        const room = f.max_per_day_usd > 0 ? f.max_per_day_usd - spentToday : Number.POSITIVE_INFINITY;
        usd = Math.min(item.usd ?? 0, Number(f.max_per_trade_usd), room);
        if (!(usd > 0.5)) {
          await finish("skipped", { reason: room <= 0.5 ? "daily limit reached" : "trade too small" });
          continue;
        }
        // Pay in ETH when the chain routes ETH to this pair; else in the paired stock.
        if (ethUsd > 0) amountIn = parseEther((usd / ethUsd).toFixed(18));
        let built = null;
        if (amountIn > 0n) {
          try {
            built = await buildTrade({ m, side, via: "eth", from, amountIn });
          } catch (e) {
            if (!(e instanceof TradeError && e.code === "NO_ROUTE")) throw e;
          }
        }
        if (!built) {
          via = "stock";
          const stockUsd = await stockPriceServer(m.chain_id, m.stock_address, m.stock_ticker);
          if (!(stockUsd > 0)) throw new TradeError(`no price for ${m.stock_ticker}`, "NO_PRICE", 502);
          const dec = findNumeraire(m.chain_id, m.stock_address)?.decimals ?? 18;
          amountIn = parseUnits((usd / stockUsd).toFixed(Math.min(dec, 18)), dec);
          built = await buildTrade({ m, side, via, from, amountIn });
        }
        if (built.balance < built.amountIn) {
          await finish("skipped", { usd, reason: `not enough ${built.symIn} in the wallet` });
          continue;
        }
        await send(d, built);
        await finish("sent", { usd, tx_hash: lastHash });
      } else {
        side = "sell";
        const held = await pc.readContract({ address: m.token_address as Address, abi: erc20Abi, functionName: "balanceOf", args: [from] });
        if (held <= 0n) {
          await finish("skipped", { reason: "holds none of it" });
          continue;
        }
        let built;
        try {
          built = await buildTrade({ m, side, via: "eth", from, amountIn: held });
        } catch (e) {
          if (!(e instanceof TradeError && e.code === "NO_ROUTE")) throw e;
          via = "stock";
          built = await buildTrade({ m, side, via, from, amountIn: held });
        }
        await send(d, built);
        await finish("sent", { usd: item.usd ?? 0, tx_hash: lastHash });
      }
    } catch (e) {
      const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
      await finish("failed", { reason: msg.split("\n")[0].slice(0, 240) });
      out.notes.push(`${f.follower.slice(0, 8)} ← ${item.tx?.slice(0, 10)}: ${msg.slice(0, 120)}`);
    }
  }
  return out;
}

let lastHash: Hex | null = null;

/** Approvals first, each confirmed, then the swap. Leaves the swap hash in lastHash. */
async function send(d: Delegation, t: Awaited<ReturnType<typeof buildTrade>>): Promise<void> {
  const chain = chainById(t.chainId)!;
  const pc = publicClientFor(chain.viem!);
  for (const a of t.approvals) {
    const h = await sendFromDelegated(d, { chainId: t.chainId, to: a.to, data: a.data });
    await pc.waitForTransactionReceipt({ hash: h, timeout: 60_000 });
  }
  lastHash = await sendFromDelegated(d, { chainId: t.chainId, to: t.tx.to, data: t.tx.data, value: t.tx.value });
  await pc.waitForTransactionReceipt({ hash: lastHash, timeout: 60_000 });
}
