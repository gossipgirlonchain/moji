import { NextResponse } from "next/server";
import { getMoji } from "@/lib/data";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { decodeCombo } from "@/lib/emoji";

export const dynamic = "force-dynamic";

/**
 * POST /api/mojis/[combo]/claimed  { txHash, amountUsd }
 * Records a successful collectFees / claimFees so "claimed" accumulates and top earners stay correct.
 */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "no service key" }, { status: 500 });
  const { combo } = await ctx.params;
  const m = await getMoji(decodeCombo(combo));
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as { txHash?: string; amountUsd?: number };
  if (!/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) return NextResponse.json({ error: "bad tx" }, { status: 400 });
  const amt = Math.max(0, Number(body.amountUsd ?? 0)) || 0;
  const sb = supabaseServer();
  const { error } = await sb
    .from("mojis")
    .update({ fees_claimed_usd: Number(m.fees_claimed_usd ?? 0) + amt, fees_unclaimed_usd: 0 })
    .eq("id", m.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
