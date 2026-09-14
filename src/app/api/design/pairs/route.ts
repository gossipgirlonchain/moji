import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";

export const dynamic = "force-dynamic";

/** GET /api/design/pairs (admin cookie) -> every launched pair, newest first, for the pickers on /design. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasSupabase()) return NextResponse.json({ pairs: [] });
  const { data, error } = await supabaseServer()
    .from("mojis")
    .select("display, stock_ticker, launched_at, volume7d_usd")
    .eq("network", NETWORK)
    .not("token_address", "is", null)
    .order("launched_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Pick<MojiRow, "display" | "stock_ticker" | "launched_at" | "volume7d_usd">[];
  return NextResponse.json({ pairs: rows.map((r) => ({ combo: r.display, ticker: r.stock_ticker, launched_at: r.launched_at })) });
}
