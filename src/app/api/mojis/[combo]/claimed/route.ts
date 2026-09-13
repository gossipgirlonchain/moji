import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { getMoji, getMojiByToken } from "@/lib/data";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { decodeCombo } from "@/lib/emoji";
import { summarizeClaim } from "@/lib/claims";

export const dynamic = "force-dynamic";

/**
 * POST /api/mojis/[combo]/claimed  { txHashes: string[] }   (legacy: { txHash })
 * Records a claim from the on-chain receipts: the amounts are the ERC-20 transfers that actually
 * landed in the caller's wallet, priced at the time of recording. Client numbers are ignored.
 */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "no service key" }, { status: 500 });
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const body = (await req.json()) as { txHashes?: string[]; txHash?: string; tokenAddress?: string; chainId?: number };
  const m =
    body.tokenAddress && body.chainId
      ? await getMojiByToken(body.chainId, body.tokenAddress)
      : await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hashes = [...(body.txHashes ?? []), ...(body.txHash ? [body.txHash] : [])].filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)) as Hex[];
  if (hashes.length === 0) return NextResponse.json({ error: "no tx" }, { status: 400 });

  const sum = await summarizeClaim(m, hashes);
  if (!sum) return NextResponse.json({ error: "could not read receipts" }, { status: 502 });

  const beneficiary = sum.beneficiary.toLowerCase();
  const role = m.creator_address && beneficiary === m.creator_address.toLowerCase() ? "creator" : "treasury";
  const sb = supabaseServer();
  // one row per claim; dedupe on the last tx hash
  const { data: existing } = await sb.from("fee_claims").select("id").eq("tx_hash", hashes[hashes.length - 1]).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, duplicate: true });
  const { error: insErr } = await sb.from("fee_claims").insert({
    combo: m.combo,
    network: m.network,
    beneficiary,
    role,
    stock_ticker: m.stock_ticker,
    stock_amount: sum.stockAmount,
    moji_amount: sum.mojiAmount,
    stock_usd: sum.stockUsd,
    moji_usd: sum.mojiUsd,
    tx_hash: hashes[hashes.length - 1],
  });
  if (insErr) return NextResponse.json({ ok: true, duplicate: insErr.code === "23505", error: insErr.code === "23505" ? undefined : insErr.message });
  if (role === "creator") {
    await sb.from("mojis").update({ fees_claimed_usd: Number(m.fees_claimed_usd ?? 0) + sum.stockUsd + sum.mojiUsd, fees_unclaimed_usd: 0 }).eq("id", m.id);
  }
  return NextResponse.json({ ok: true, ...sum });
}
