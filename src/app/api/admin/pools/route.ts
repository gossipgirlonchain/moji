import { NextResponse } from "next/server";
import type { Address } from "viem";
import { isAdmin } from "@/lib/admin";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { getMojiFees } from "@/lib/fees";
import { getMarket } from "@/lib/market";
import { MOJI_TREASURY } from "@/config/fees";

export const dynamic = "force-dynamic";

/** GET /api/admin/pools (cookie-gated): every live pool with the treasury's pending fees + market. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasSupabase() || !MOJI_TREASURY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const sb = supabaseServer();
  const { data } = await sb.from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null).order("launched_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as MojiRow[];
  const pools = await Promise.all(
    rows.map(async (m) => {
      const market = await getMarket(m);
      const fees = await getMojiFees(m, { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd }, MOJI_TREASURY as Address);
      return { ...m, market, fees };
    }),
  );
  const totals = pools.reduce(
    (t, p) => ({ pendingUsd: t.pendingUsd + p.fees.pendingUsd, mcap: t.mcap + p.market.marketCapUsd, claimable: t.claimable + (p.fees.sources.pool || p.fees.sources.hook ? 1 : 0) }),
    { pendingUsd: 0, mcap: 0, claimable: 0 },
  );
  return NextResponse.json({ treasury: MOJI_TREASURY, pools, totals, count: pools.length }, { headers: { "cache-control": "no-store" } });
}
