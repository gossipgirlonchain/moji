import { NextResponse } from "next/server";
import { validateCombo } from "@/lib/emoji";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { verifyPrivyToken } from "@/lib/privy-server";
import { findStock } from "@/config/stocks";
import { chainById } from "@/config/chains";

export const dynamic = "force-dynamic";

type Body = {
  combo: string;
  chainId: number;
  stockAddress: string;
  tokenAddress: string;
  poolId?: string;
  txHash: string;
  supply?: string;
  creatorHandle?: string | null;
  creatorAddress: string;
};

/**
 * POST /api/launch
 * Records a successful on-chain launch: inserts the claim (unique index enforces permanence)
 * and the moji row with creator DID / X handle / wallet address.
 */
export async function POST(req: Request) {
  if (!hasSupabase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase service role key not configured" }, { status: 500 });
  }
  const body = (await req.json()) as Body;

  const v = validateCombo(body.combo ?? "");
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

  const chain = chainById(Number(body.chainId));
  if (!chain || chain.comingSoon) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  const stock = findStock(chain.chainId, body.stockAddress);
  if (!stock) return NextResponse.json({ error: "Stock must be from the curated list" }, { status: 400 });

  if (!/^0x[0-9a-fA-F]{40}$/.test(body.tokenAddress ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) {
    return NextResponse.json({ error: "Bad token address or tx hash" }, { status: 400 });
  }

  const verified = await verifyPrivyToken(req.headers.get("authorization"));
  if (verified === null) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const creatorDid = verified === "unconfigured" ? null : verified.did;

  const sb = supabaseServer();
  const { error: claimErr } = await sb.from("claims").insert({
    combo: v.normalized,
    display: v.display,
    chain_id: chain.chainId,
  });
  if (claimErr) {
    const conflict = claimErr.code === "23505";
    return NextResponse.json({ error: conflict ? "That combo was just claimed" : claimErr.message }, { status: conflict ? 409 : 500 });
  }

  const { data, error } = await sb
    .from("mojis")
    .insert({
      combo: v.normalized,
      display: v.display,
      chain_id: chain.chainId,
      stock_ticker: stock.ticker,
      stock_address: stock.address,
      token_address: body.tokenAddress,
      pool_id: body.poolId ?? null,
      tx_hash: body.txHash,
      supply: body.supply ?? null,
      creator_did: creatorDid,
      creator_handle: body.creatorHandle?.replace(/^@/, "") ?? null,
      creator_address: body.creatorAddress,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ moji: data, href: `/m/${encodeURIComponent(v.display)}` });
}
