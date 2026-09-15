import "server-only";
import { supabaseServer, hasSupabase, type MojiRow } from "./supabase";
import { NETWORK } from "./network";

export type Launcher = {
  key: string;
  handle: string | null;
  address: string | null;
  launches: number;
  /** creator's share of fees, pending + claimed, USD at current prices */
  earnedUsd: number;
  mcapUsd: number;
  volume24Usd: number;
  volumeAllUsd: number;
  best: Pick<MojiRow, "display" | "stock_ticker" | "chain_id"> | null;
  firstLaunch: string;
};

/** Every launcher, aggregated from the snapshot columns. One row per X handle (or wallet when no handle). */
export async function listLaunchers(): Promise<Launcher[]> {
  if (!hasSupabase()) return [];
  const { data } = await supabaseServer()
    .from("mojis")
    .select("display, stock_ticker, creator_handle, creator_address, market_cap_usd, volume24_usd, volume_all_usd, fees_claimed_usd, fees_unclaimed_usd, launched_at")
    .eq("network", NETWORK)
    .not("token_address", "is", null)
    .limit(5000);
  const by = new Map<string, Launcher & { bestMcap: number }>();
  for (const m of (data ?? []) as MojiRow[]) {
    const key = m.creator_handle ? `@${m.creator_handle.toLowerCase()}` : m.creator_address ? m.creator_address.toLowerCase() : null;
    if (!key) continue;
    const mcap = Number(m.market_cap_usd ?? 0);
    const earned = Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
    const row = by.get(key) ?? {
      key,
      handle: m.creator_handle ?? null,
      address: m.creator_address ?? null,
      launches: 0,
      earnedUsd: 0,
      mcapUsd: 0,
      volume24Usd: 0,
      volumeAllUsd: 0,
      best: null,
      bestMcap: -1,
      firstLaunch: m.launched_at,
    };
    row.launches++;
    row.earnedUsd += earned;
    row.mcapUsd += mcap;
    row.volume24Usd += Number(m.volume24_usd ?? 0);
    row.volumeAllUsd += Number(m.volume_all_usd ?? 0);
    if (mcap > row.bestMcap) {
      row.bestMcap = mcap;
      row.best = { display: m.display, stock_ticker: m.stock_ticker, chain_id: m.chain_id };
    }
    if (m.launched_at < row.firstLaunch) row.firstLaunch = m.launched_at;
    by.set(key, row);
  }
  return [...by.values()].map(({ bestMcap: _b, ...r }) => r).sort((a, b) => b.earnedUsd - a.earnedUsd);
}
