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
  const body = (await req.json()) as { txHash?: string; amountUsd?: number; beneficiary?: string; stockAmount?: number; mojiAmount?: number; stockUsd?: number; mojiUsd?: number };
  if (!/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) return NextResponse.json({ error: "bad tx" }, { status: 400 });
  const n = (v: unknown) => Math.max(0, Number(v ?? 0)) || 0;
  const amt = n(body.amountUsd);
  const beneficiary = (body.beneficiary ?? m.creator_address ?? "").toLowerCase();
  const role = beneficiary && m.creator_address && beneficiary === m.creator_address.toLowerCase() ? "creator" : "treasury";
  const sb = supabaseServer();
  await sb.from("fee_claims").insert({
    combo: m.combo,
    network: m.network,
    beneficiary,
    role,
    stock_ticker: m.stock_ticker,
    stock_amount: n(body.stockAmount),
    moji_amount: n(body.mojiAmount),
    stock_usd: n(body.stockUsd),
    moji_usd: n(body.mojiUsd),
    tx_hash: body.txHash,
  });
  if (role === "creator") {
    const { error } = await sb.from("mojis").update({ fees_claimed_usd: Number(m.fees_claimed_usd ?? 0) + amt, fees_unclaimed_usd: 0 }).eq("id", m.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
