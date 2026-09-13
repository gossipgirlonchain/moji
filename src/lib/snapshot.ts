import "server-only";
import { supabaseServer, type MojiRow } from "./supabase";
import { windowedVolume, getMarket } from "./market";
import { getMojiFees } from "./fees";
import { claimPatch, scanClaims } from "./fee-scan";
import { NETWORK } from "./network";

/**
 * Refresh the per-moji snapshot columns (market cap, price, volume, creator pending fees, current fee).
 * Pages render from these columns instantly; the client polls live numbers after paint.
 * Runs from /api/cron/refresh every 2 minutes and after a launch.
 */
export async function refreshSnapshots(limit = 300, concurrency = 6, scanChunks = 6): Promise<{ updated: number; failed: number; scanned: number; scanErrors: number; firstScanError?: string }> {
  const sb = supabaseServer();
  const { data } = await sb.from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null).order("snapshot_at", { ascending: true, nullsFirst: true }).limit(limit);
  const rows = (data ?? []) as MojiRow[];
  let updated = 0;
  let failed = 0;
  let scanned = 0;
  let scanErrors = 0;
  let firstScanError: string | undefined;
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
          txns24: market.txns24,
          snapshot_at: new Date().toISOString(),
        };
        // All-time volume walks the swap history; refresh it every 10 minutes per pool.
        const stale = !m.volume_all_at || Date.now() - new Date(m.volume_all_at).getTime() > 10 * 60_000;
        if (stale) {
          const w = await windowedVolume(m);
          if (w) {
            patch.volume_all_usd = w.all;
            patch.volume7d_usd = w.d7;
            patch.volume30d_usd = w.d30;
            patch.txns_all = w.txnsAll;
            patch.txns7d = w.txns7;
            patch.txns30d = w.txns30;
            patch.volume_all_at = new Date().toISOString();
          }
        }
        if (fees.live) {
          patch.fees_unclaimed_usd = fees.pendingUsd;
          patch.fees_stock_pending = fees.pending.stock;
          patch.fees_moji_pending = fees.pending.moji;
          patch.fee_current = fees.schedule?.currentFee ?? null;
        }
        // Claimed fees come from chain: Transfer logs from Doppler's fee contracts to the beneficiaries,
        // walked incrementally from the last scanned block. Guarded so two refreshes never double count.
        try {
          const scan = await scanClaims(m, { maxChunks: scanChunks });
          if (scan) {
            Object.assign(patch, claimPatch(m, scan, { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd }));
            scanned++;
          }
        } catch (e) {
          scanErrors++;
          firstScanError = firstScanError ?? String((e as Error).message ?? e).slice(0, 300);
        }
        let q = sb.from("mojis").update(patch).eq("id", m.id);
        if ("fees_scanned_block" in patch) q = m.fees_scanned_block == null ? q.is("fees_scanned_block", null) : q.eq("fees_scanned_block", m.fees_scanned_block);
        const { error } = await q;
        if (error) failed++;
        else updated++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { updated, failed, scanned, scanErrors, firstScanError };
}

export async function refreshOne(m: MojiRow): Promise<void> {
  const sb = supabaseServer();
  const market = await getMarket(m);
  await sb.from("mojis").update({ market_cap_usd: market.marketCapUsd, price_usd: market.priceUsd, volume24_usd: market.volume24Usd, snapshot_at: new Date().toISOString() }).eq("id", m.id);
}

/** Right after a claim lands: fold the new Transfer logs into the stored claimed totals. */
export async function refreshClaims(m: MojiRow): Promise<void> {
  const sb = supabaseServer();
  const market = await getMarket(m);
  const scan = await scanClaims(m, { maxChunks: 10 });
  if (!scan) return;
  let q = sb.from("mojis").update(claimPatch(m, scan, { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd })).eq("id", m.id);
  q = m.fees_scanned_block == null ? q.is("fees_scanned_block", null) : q.eq("fees_scanned_block", m.fees_scanned_block);
  await q;
}
