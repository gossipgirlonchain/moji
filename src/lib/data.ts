import "server-only";
import { cache } from "react";
import { hasSupabase, supabaseServer, type MojiRow, type ClaimRow } from "./supabase";
import { normalizeCombo } from "./emoji";
import { normalizeAny } from "./meme-coin";
import { NETWORK } from "./network";

export type SortKey = "newest" | "mcap" | "fees" | "volume";
export type Window = "1h" | "6h" | "24h" | "all";
export const VOLUME_COL: Record<Window, string> = { "1h": "volume1h_usd", "6h": "volume6h_usd", "24h": "volume24_usd", all: "volume_all_usd" };

export async function listMojis(opts: { sort?: SortKey; q?: string; limit?: number; window?: Window; withMeme?: boolean } = {}): Promise<MojiRow[]> {
  if (!hasSupabase()) return [];
  const sb = supabaseServer();
  let query = sb.from("mojis").select("*").eq("network", NETWORK);
  if (opts.withMeme) query = query.not("meme_url", "is", null);
  if (opts.q) {
    const q = opts.q.trim();
    query = query.or(`display.ilike.%${q}%,stock_ticker.ilike.%${q}%`);
  }
  switch (opts.sort ?? "newest") {
    case "mcap":
      query = query.order("market_cap_usd", { ascending: false, nullsFirst: false });
      break;
    case "volume":
      query = query.order(VOLUME_COL[opts.window ?? "24h"], { ascending: false, nullsFirst: false });
      break;
    case "fees":
      query = query.order("fees_total_usd", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("launched_at", { ascending: false });
  }
  const { data, error } = await query.limit(opts.limit ?? 100);
  if (error) {
    console.error("listMojis", error.message);
    return [];
  }
  return (data ?? []) as MojiRow[];
}

/**
 * Find a moji by combo, optionally narrowed to a pair (ticker or numeraire address) and chain.
 * Claims are per pair, so a combo can exist several times; without a pair the earliest launch wins
 * (keeps old /m/🍎 links working). Deduped per request so generateMetadata + the page share one query.
 */
export const getMoji = cache(async (comboInput: string, pair: string | null = null, chainId: number | null = null): Promise<MojiRow | null> => {
  if (!hasSupabase()) return null;
  const combo = normalizeAny(comboInput);
  const sb = supabaseServer();
  let q = sb.from("mojis").select("*").eq("combo", combo).eq("network", NETWORK);
  if (pair) q = /^0x[0-9a-fA-F]{40}$/.test(pair) ? q.ilike("stock_address", pair) : q.ilike("stock_ticker", pair);
  if (chainId) q = q.eq("chain_id", chainId);
  const { data } = await q.order("launched_at", { ascending: true }).limit(1);
  return ((data ?? [])[0] as MojiRow) ?? null;
});

export async function getMojiByToken(chainId: number, tokenAddress: string): Promise<MojiRow | null> {
  if (!hasSupabase()) return null;
  const { data } = await supabaseServer().from("mojis").select("*").eq("network", NETWORK).eq("chain_id", chainId).ilike("token_address", tokenAddress).maybeSingle();
  return (data as MojiRow) ?? null;
}

/** All mojis sharing a combo (one per pair). */
export async function getMojiSiblings(comboInput: string): Promise<MojiRow[]> {
  if (!hasSupabase()) return [];
  const { data } = await supabaseServer().from("mojis").select("*").eq("combo", normalizeCombo(comboInput)).eq("network", NETWORK).order("launched_at", { ascending: true });
  return (data ?? []) as MojiRow[];
}

export async function listClaims(): Promise<ClaimRow[]> {
  if (!hasSupabase()) return [];
  const sb = supabaseServer();
  const { data } = await sb.from("claims").select("*").eq("network", NETWORK).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as ClaimRow[];
}

export async function claimsCount(): Promise<number> {
  if (!hasSupabase()) return 0;
  const sb = supabaseServer();
  const { count } = await sb.from("claims").select("combo", { count: "exact", head: true }).eq("network", NETWORK);
  return count ?? 0;
}

/** Claims are per pair: (combo, chain, numeraire). */
export async function isClaimed(normalized: string, chainId: number, stockAddress: string): Promise<{ claimed: boolean; display?: string; ticker?: string }> {
  if (!hasSupabase()) return { claimed: false };
  const sb = supabaseServer();
  const { data } = await sb.from("mojis").select("display, stock_ticker").eq("combo", normalized).eq("network", NETWORK).eq("chain_id", chainId).ilike("stock_address", stockAddress).limit(1);
  const row = (data ?? [])[0] as { display: string; stock_ticker: string } | undefined;
  return row ? { claimed: true, display: row.display, ticker: row.stock_ticker } : { claimed: false };
}

export async function claimedSet(normalizedList: string[], chainId: number, stockAddress: string): Promise<Set<string>> {
  if (!hasSupabase() || normalizedList.length === 0) return new Set();
  const sb = supabaseServer();
  const { data } = await sb.from("claims").select("combo").eq("network", NETWORK).eq("chain_id", chainId).ilike("stock_address", stockAddress).in("combo", normalizedList);
  return new Set(((data ?? []) as { combo: string }[]).map((r) => r.combo));
}

/** Top earners from the snapshot columns (pending + claimed), no chain reads. */
export async function topEarnersFast(limit = 3): Promise<(MojiRow & { earnedUsd: number })[]> {
  const rows = await listMojis({ sort: "fees", limit: 50 });
  return rows
    .map((r) => ({ ...r, earnedUsd: Number(r.fees_claimed_usd ?? 0) + Number(r.fees_unclaimed_usd ?? 0) }))
    .filter((r) => r.token_address)
    .sort((a, b) => b.earnedUsd - a.earnedUsd)
    .slice(0, limit);
}
