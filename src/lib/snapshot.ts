import "server-only";
import { supabaseServer, type MojiRow } from "./supabase";
import { allTimeVolume, getMarket } from "./market";
import { getMojiFees } from "./fees";
import { NETWORK } from "./network";

/**
 * Refresh the per-moji snapshot columns (market cap, price, volume, creator pending fees, current fee).
 * Pages render from these columns instantly; the client polls live numbers after paint.
 * Runs from /api/cron/refresh every 2 minutes and after a launch.
 */
export async function refreshSnapshots(limit = 300, concurrency = 6): Promise<{ updated: number; failed: number }> {
  const sb = supabaseServer();
  const { data } = await sb.from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null).order("snapshot_at", { ascending: true, nullsFirst: true }).limit(limit);
  const rows = (data ?? []) as MojiRow[];
  let updated = 0;
  let failed = 0;
  const queue = [...rows];
  const worker = async () => {
    while (queue.length) {
      const m = queue.shift()!;
      try {
        const market = await getMarket(m);
        const fees = await getMojiFees(m, { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd });
        const patch: Record<string, unknown> = {
          market_cap_usd: market.marketCapUsd,
          price_usd: market.priceUsd,
          volume24_usd: market.volume24Usd,
          volume6h_usd: market.volume6hUsd,
          volume1h_usd: market.volume1hUsd,
          snapshot_at: new Date().toISOString(),
        };
        // All-time volume walks the swap history; refresh it every 10 minutes per pool.
        const stale = !m.volume_all_at || Date.now() - new Date(m.volume_all_at).getTime() > 10 * 60_000;
        if (stale) {
          const all = await allTimeVolume(m);
          if (all) {
            patch.volume_all_usd = all.volumeUsd;
            patch.txns_all = all.txns;
            patch.volume_all_at = new Date().toISOString();
          }
        }
        if (fees.live) {
          patch.fees_unclaimed_usd = fees.pendingUsd;
          patch.fees_stock_pending = fees.pending.stock;
          patch.fees_moji_pending = fees.pending.moji;
          patch.fee_current = fees.schedule?.currentFee ?? null;
        }
        const { error } = await sb.from("mojis").update(patch).eq("id", m.id);
        if (error) failed++;
        else updated++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { updated, failed };
}

export async function refreshOne(m: MojiRow): Promise<void> {
  const sb = supabaseServer();
  const market = await getMarket(m);
  await sb.from("mojis").update({ market_cap_usd: market.marketCapUsd, price_usd: market.priceUsd, volume24_usd: market.volume24Usd, snapshot_at: new Date().toISOString() }).eq("id", m.id);
}
