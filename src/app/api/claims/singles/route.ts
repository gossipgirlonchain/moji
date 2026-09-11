import { NextResponse } from "next/server";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { graphemes } from "@/lib/emoji";

export const dynamic = "force-dynamic";

/** GET /api/claims/singles → every claimed single-emoji combo (normalized), for the picker filter. */
export async function GET() {
  if (!hasSupabase()) return NextResponse.json({ combos: [] });
  const { data } = await supabaseServer().from("claims").select("combo").eq("network", NETWORK).limit(5000);
  const combos = (data ?? []).map((r) => String(r.combo)).filter((c) => graphemes(c).length === 1);
  return NextResponse.json({ combos }, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } });
}
