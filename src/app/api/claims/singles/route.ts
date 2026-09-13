import { NextResponse } from "next/server";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { graphemes } from "@/lib/emoji";

export const dynamic = "force-dynamic";

/** GET /api/claims/singles?chainId=&pair=0x… → claimed single-emoji combos on that pair, for the picker filter. */
export async function GET(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ combos: [] });
  const u = new URL(req.url);
  const chainId = Number(u.searchParams.get("chainId") ?? 0);
  const pair = u.searchParams.get("pair") ?? "";
  if (!chainId || !/^0x[0-9a-fA-F]{40}$/.test(pair)) return NextResponse.json({ combos: [] });
  const { data } = await supabaseServer().from("claims").select("combo").eq("network", NETWORK).eq("chain_id", chainId).ilike("stock_address", pair).limit(5000);
  const combos = (data ?? []).map((r) => String(r.combo)).filter((c) => graphemes(c).length === 1);
  return NextResponse.json({ combos }, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } });
}
