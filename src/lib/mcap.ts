import "server-only";
import { chainById } from "@/config/chains";
import type { MojiRow } from "./supabase";

/** Live market cap from Dexscreener for rows that have a token; stored value otherwise. Cached 60s per token. */
async function liveMcap(m: MojiRow): Promise<number> {
  if (!m.token_address) return Number(m.market_cap_usd ?? 0);
  const chain = chainById(m.chain_id);
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain?.dexscreenerSlug ?? "robinhood"}/${m.token_address}`, { next: { revalidate: 60 } });
    if (!r.ok) return Number(m.market_cap_usd ?? 0);
    const pairs = (await r.json()) as { priceUsd?: string; marketCap?: number; fdv?: number }[];
    const p = pairs?.[0];
    if (!p) return Number(m.market_cap_usd ?? 0);
    return Number(p.marketCap ?? p.fdv ?? 0) || Number(p.priceUsd ?? 0) * Number(m.supply ?? 0);
  } catch {
    return Number(m.market_cap_usd ?? 0);
  }
}

export async function withLiveMcap<T extends MojiRow>(rows: T[]): Promise<T[]> {
  return Promise.all(rows.map(async (m) => ({ ...m, market_cap_usd: await liveMcap(m) })));
}
