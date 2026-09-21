import "server-only";
import { formatUnits } from "viem";
import { supabaseServer, hasSupabase, type MojiRow } from "./supabase";
import { NETWORK, SITE_URL } from "./network";
import { gql } from "./market";
import { explorerTx } from "./links";
import { findNumeraire } from "./numeraire";
import type { DropRow } from "./drops/types";
import { allNames } from "./agent-names";

export type FeedKind = "launch" | "buy" | "sell" | "drop";
export type FeedActor = { address: string | null; name: string | null; handle: string | null; kind: "x" | "wallet" | "agent" | null; moji: string | null };
export type FeedItem = {
  id: string;
  ts: number;
  kind: FeedKind;
  moji: { display: string; ticker: string; chainId: number; tokenAddress: string | null; page: string };
  actor: FeedActor;
  usd: number | null;
  /** buy/sell: what went in and what came out, in whole units */
  amountIn?: { amount: string; symbol: string };
  amountOut?: { amount: string; symbol: string };
  /** drop: how many wallets were paid */
  recipients?: number;
  tx: string | null;
  explorer: string | null;
};

export type FeedQuery = { limit?: number; since?: number; kinds?: FeedKind[]; actor?: string; chainId?: number };

type Lite = Pick<MojiRow, "id" | "display" | "combo" | "stock_ticker" | "stock_address" | "chain_id" | "token_address" | "pool_id" | "creator_address" | "creator_handle" | "creator_kind" | "launched_at" | "tx_hash">;

const pageFor = (m: Pick<Lite, "display" | "stock_ticker" | "chain_id">) => `${SITE_URL}/m/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}${m.chain_id !== 4663 ? `/${m.chain_id}` : ""}`;

/**
 * The receipts: every launch, swap and drop across every moji, newest first. Nothing is stored for this; launches
 * and drops come from Supabase, swaps from the Doppler indexer (one query per chain over the pools we know).
 * The actor of a swap is the wallet that sent it; when that wallet launched a moji it carries that handle and 🤖.
 */
export async function feed(q: FeedQuery = {}): Promise<FeedItem[]> {
  if (!hasSupabase()) return [];
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const kinds = new Set<FeedKind>(q.kinds?.length ? q.kinds : ["launch", "buy", "sell", "drop"]);
  const actor = q.actor?.toLowerCase() ?? null;
  const sb = supabaseServer();

  let mq = sb.from("mojis").select("id, display, combo, stock_ticker, stock_address, chain_id, token_address, pool_id, creator_address, creator_handle, creator_kind, launched_at, tx_hash").eq("network", NETWORK).not("token_address", "is", null).limit(5000);
  if (q.chainId) mq = mq.eq("chain_id", q.chainId);
  const [{ data: mojiData }, names] = await Promise.all([mq, allNames()]);
  const mojis = (mojiData ?? []) as Lite[];
  const byPool = new Map<string, Lite>();
  const byCreator = new Map<string, Lite>();
  for (const m of mojis) {
    if (m.pool_id) byPool.set(`${m.chain_id}:${m.pool_id.toLowerCase()}`, m);
    if (m.creator_address && !byCreator.has(m.creator_address.toLowerCase())) byCreator.set(m.creator_address.toLowerCase(), m);
  }
  const actorFor = (address: string | null): FeedActor => {
    const m = address ? byCreator.get(address.toLowerCase()) : undefined;
    return { address, name: address ? (names.get(address.toLowerCase()) ?? null) : null, handle: m?.creator_handle ?? null, kind: m?.creator_kind ?? (m ? "x" : null), moji: m?.display ?? null };
  };
  const items: FeedItem[] = [];

  if (kinds.has("launch")) {
    for (const m of mojis) {
      if (actor && m.creator_address?.toLowerCase() !== actor) continue;
      const ts = Math.floor(new Date(m.launched_at).getTime() / 1000);
      if (q.since && ts <= q.since) continue;
      items.push({ id: `launch:${m.id}`, ts, kind: "launch", moji: { display: m.display, ticker: m.stock_ticker, chainId: m.chain_id, tokenAddress: m.token_address, page: pageFor(m) }, actor: actorFor(m.creator_address), usd: null, tx: m.tx_hash, explorer: m.tx_hash ? explorerTx(m.chain_id, m.tx_hash) : null });
    }
  }

  if (kinds.has("buy") || kinds.has("sell")) {
    type Swap = { txHash: string; pool: string; type: string; amountIn: string; amountOut: string; user: string; timestamp: string; swapValueUsd: string };
    const chains = [...new Set(mojis.map((m) => m.chain_id))];
    await Promise.all(
      chains.map(async (chainId) => {
        const pools = mojis.filter((m) => m.chain_id === chainId && m.pool_id).map((m) => m.pool_id!.toLowerCase());
        if (pools.length === 0) return;
        const where: string[] = [`chainId: ${chainId}`, `pool_in: $pools`];
        if (actor) where.push(`user: "${actor}"`);
        if (q.since) where.push(`timestamp_gt: "${q.since}"`);
        const data = await gql<{ swaps: { items: Swap[] } }>(
          `query F($pools: [String!]) { swaps(where: { ${where.join(", ")} }, orderBy: "timestamp", orderDirection: "desc", limit: ${limit}) { items { txHash pool type amountIn amountOut user timestamp swapValueUsd } } }`,
          { pools },
        );
        for (const s of data?.swaps?.items ?? []) {
          const m = byPool.get(`${chainId}:${s.pool.toLowerCase()}`);
          if (!m) continue;
          const kind: FeedKind = s.type?.toLowerCase() === "buy" ? "buy" : "sell";
          if (!kinds.has(kind)) continue;
          const dec = findNumeraire(chainId, m.stock_address)?.decimals ?? 18;
          const [decIn, decOut, symIn, symOut] = kind === "buy" ? [dec, 18, m.stock_ticker, m.display] : [18, dec, m.display, m.stock_ticker];
          items.push({
            id: `swap:${chainId}:${s.txHash}`,
            ts: Number(s.timestamp),
            kind,
            moji: { display: m.display, ticker: m.stock_ticker, chainId, tokenAddress: m.token_address, page: pageFor(m) },
            actor: actorFor(s.user),
            usd: Number(formatUnits(BigInt(s.swapValueUsd ?? "0"), 18)) || null,
            amountIn: { amount: formatUnits(BigInt(s.amountIn), decIn), symbol: symIn },
            amountOut: { amount: formatUnits(BigInt(s.amountOut), decOut), symbol: symOut },
            tx: s.txHash,
            explorer: explorerTx(chainId, s.txHash),
          });
        }
      }),
    );
  }

  if (kinds.has("drop")) {
    let dq = sb.from("drops").select("*").eq("network", NETWORK).in("status", ["sending", "sent"]).order("created_at", { ascending: false }).limit(limit);
    if (actor) dq = dq.ilike("creator_address", actor);
    if (q.since) dq = dq.gt("created_at", new Date(q.since * 1000).toISOString());
    const { data } = await dq;
    const byId = new Map(mojis.map((m) => [m.id, m]));
    for (const d of (data ?? []) as DropRow[]) {
      const m = byId.get(d.moji_id);
      if (!m) continue;
      items.push({ id: `drop:${d.id}`, ts: Math.floor(new Date(d.completed_at ?? d.created_at).getTime() / 1000), kind: "drop", moji: { display: m.display, ticker: m.stock_ticker, chainId: m.chain_id, tokenAddress: m.token_address, page: pageFor(m) }, actor: actorFor(d.creator_address), usd: Number(d.sent_usd) || null, amountOut: { amount: String(d.amount), symbol: d.token_symbol }, recipients: d.sent_count, tx: d.fee_tx, explorer: d.fee_tx ? explorerTx(m.chain_id, d.fee_tx) : null });
    }
  }

  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, limit);
}
