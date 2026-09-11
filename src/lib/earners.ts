import "server-only";
import { listMojis } from "./data";
import { getMojiFees } from "./fees";
import { stockPriceServer } from "./market";
import type { MojiRow } from "./supabase";
import { chainById } from "@/config/chains";

export type Earner = MojiRow & { earnedUsd: number; pendingUsd: number };

async function mojiPriceUsd(m: MojiRow): Promise<number> {
  if (!m.token_address) return 0;
  const chain = chainById(m.chain_id);
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain?.dexscreenerSlug ?? "robinhood"}/${m.token_address}`, { next: { revalidate: 60 } });
    if (!r.ok) return 0;
    const pairs = (await r.json()) as { priceUsd?: string }[];
    return Number(pairs?.[0]?.priceUsd ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Creators ranked by fees earned: live pending fees (both tokens, priced to USD) + recorded claimed fees.
 * Same source as the moji page fees card.
 */
export async function topEarners(limit = 3): Promise<Earner[]> {
  const rows = await listMojis({ sort: "fees", limit: 40 });
  const scored = await Promise.all(
    rows.map(async (m) => {
      const [stockUsd, mojiUsd] = await Promise.all([m.token_address ? stockPriceServer(m.chain_id, m.stock_address) : 0, mojiPriceUsd(m)]);
      const f = await getMojiFees(m, { stockUsd, mojiUsd });
      return { ...m, earnedUsd: f.earnedUsd, pendingUsd: f.pendingUsd };
    }),
  );
  return scored.sort((a, b) => b.earnedUsd - a.earnedUsd).slice(0, limit);
}
