import { NextResponse } from "next/server";
import type { Address } from "viem";
import { isAdmin } from "@/lib/admin";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { getMojiFees } from "@/lib/fees";
import { getMarket } from "@/lib/market";
import { MOJI_TREASURY } from "@/config/fees";

export const dynamic = "force-dynamic";

type ClaimRow = { role: string; stock_usd: number; moji_usd: number; stock_amount: number; moji_amount: number; created_at: string; combo: string; stock_ticker: string | null };

/**
 * GET /api/admin/pools (cookie-gated)
 * Every live pool with market data, the treasury's pending fees (split stock vs moji, in tokens and USD),
 * the creator's pending fees, plus protocol-wide statistics.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasSupabase() || !MOJI_TREASURY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const sb = supabaseServer();
  const [{ data }, { data: claimsData }, { count: claimsCount }] = await Promise.all([
    sb.from("mojis").select("*").eq("network", NETWORK).order("launched_at", { ascending: false }).limit(300),
    sb.from("fee_claims").select("role, stock_usd, moji_usd, stock_amount, moji_amount, created_at, combo, stock_ticker").eq("network", NETWORK).order("created_at", { ascending: false }).limit(500),
    sb.from("claims").select("combo", { count: "exact", head: true }).eq("network", NETWORK),
  ]);
  const all = (data ?? []) as MojiRow[];
  const live = all.filter((m) => m.token_address);

  const pools = await Promise.all(
    live.map(async (m) => {
      const market = await getMarket(m);
      const prices = { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd };
      const [treasury, creator] = await Promise.all([getMojiFees(m, prices, MOJI_TREASURY as Address), getMojiFees(m, prices)]);
      return { ...m, market, fees: treasury, creatorFees: creator };
    }),
  );

  const sum = (f: (p: (typeof pools)[number]) => number) => pools.reduce((t, p) => t + f(p), 0);
  const treasury = {
    stockUsd: sum((p) => p.fees.pendingStockUsd),
    mojiUsd: sum((p) => p.fees.pendingMojiUsd),
    totalUsd: sum((p) => p.fees.pendingUsd),
    claimable: pools.filter((p) => p.fees.sources.pool || p.fees.sources.hook).length,
  };
  const creators = {
    stockUsd: sum((p) => p.creatorFees.pendingStockUsd),
    mojiUsd: sum((p) => p.creatorFees.pendingMojiUsd),
    totalUsd: sum((p) => p.creatorFees.pendingUsd),
  };

  const claims = (claimsData ?? []) as ClaimRow[];
  const claimed = (role: string) => {
    const rows = claims.filter((c) => c.role === role);
    return { count: rows.length, stockUsd: rows.reduce((t, c) => t + Number(c.stock_usd), 0), mojiUsd: rows.reduce((t, c) => t + Number(c.moji_usd), 0) };
  };

  // Launches per day (last 14 days) and per-stock distribution
  const days: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) days[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0;
  for (const m of all) {
    const d = m.launched_at.slice(0, 10);
    if (d in days) days[d]++;
  }
  const byStock: Record<string, { count: number; mcap: number; volume24: number }> = {};
  for (const p of pools) {
    const b = (byStock[p.stock_ticker] ??= { count: 0, mcap: 0, volume24: 0 });
    b.count++;
    b.mcap += p.market.marketCapUsd;
    b.volume24 += p.market.volume24Usd;
  }
  const stocks = Object.entries(byStock)
    .map(([ticker, v]) => ({ ticker, ...v }))
    .sort((a, b) => b.count - a.count || b.mcap - a.mcap);

  const dayMs = 86400000;
  const now = Date.now();
  const stats = {
    pools: pools.length,
    combosClaimed: claimsCount ?? all.length,
    launches24h: all.filter((m) => now - new Date(m.launched_at).getTime() < dayMs).length,
    launches7d: all.filter((m) => now - new Date(m.launched_at).getTime() < 7 * dayMs).length,
    uniqueCreators: new Set(all.map((m) => (m.creator_did ?? m.creator_address ?? "").toLowerCase()).values()).size,
    withX: all.filter((m) => m.creator_handle).length,
    totalMcap: sum((p) => p.market.marketCapUsd),
    volume24: sum((p) => p.market.volume24Usd),
    volume6h: sum((p) => p.market.volume6hUsd),
    volume1h: sum((p) => p.market.volume1hUsd),
    txns24: sum((p) => p.market.txns24),
    volumeAll: sum((p) => Number(p.volume_all_usd ?? 0)),
    txnsAll: sum((p) => Number(p.txns_all ?? 0)),
    liquidity: sum((p) => p.market.liquidityUsd),
    decaying: pools.filter((p) => p.fees.schedule?.decaying).length,
    distinctStocks: stocks.length,
    launchesPerDay: Object.entries(days).map(([day, n]) => ({ day, n })),
    stocks,
    top: {
      mcap: [...pools].sort((a, b) => b.market.marketCapUsd - a.market.marketCapUsd).slice(0, 5).map((p) => ({ display: p.display, ticker: p.stock_ticker, v: p.market.marketCapUsd })),
      volume: [...pools].sort((a, b) => b.market.volume24Usd - a.market.volume24Usd).slice(0, 5).map((p) => ({ display: p.display, ticker: p.stock_ticker, v: p.market.volume24Usd })),
      volumeAll: [...pools].sort((a, b) => Number(b.volume_all_usd ?? 0) - Number(a.volume_all_usd ?? 0)).slice(0, 5).map((p) => ({ display: p.display, ticker: p.stock_ticker, v: Number(p.volume_all_usd ?? 0) })),
      treasury: [...pools].sort((a, b) => b.fees.pendingUsd - a.fees.pendingUsd).slice(0, 5).map((p) => ({ display: p.display, ticker: p.stock_ticker, v: p.fees.pendingUsd })),
    },
    treasury,
    creators,
    claimed: { treasury: claimed("treasury"), creator: claimed("creator") },
    recentClaims: claims.slice(0, 10),
  };

  return NextResponse.json({ treasury: MOJI_TREASURY, pools, stats }, { headers: { "cache-control": "no-store" } });
}
