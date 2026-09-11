import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy-server";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { getMojiFees } from "@/lib/fees";
import { stockPriceServer } from "@/lib/market";
import { chainById } from "@/config/chains";
import { MOJI_TREASURY } from "@/config/fees";
import type { Address } from "viem";

export const dynamic = "force-dynamic";

async function mojiPriceUsd(m: MojiRow): Promise<number> {
  if (!m.token_address) return 0;
  const chain = chainById(m.chain_id);
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain?.dexscreenerSlug ?? "robinhood"}/${m.token_address}`, { next: { revalidate: 60 } });
    if (!r.ok) return 0;
    const pairs = (await r.json()) as { priceUsd?: string }[];
    return Number(pairs?.[0]?.priceUsd ?? 0);
  } catch {
    return 0;
  }
}

/**
 * GET /api/me/mojis?address=0x…   (Authorization: Bearer <privy access token>)
 * Mojis launched by the caller: matched on Privy DID, or on the connected wallet address.
 * Each row carries live pending fees so the page can claim from it.
 */
export async function GET(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ mojis: [] });
  const verified = await verifyPrivyToken(req.headers.get("authorization"));
  const did = verified && verified !== "unconfigured" ? verified.did : null;
  const address = (new URL(req.url).searchParams.get("address") ?? "").toLowerCase();
  if (!did && !/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const sb = supabaseServer();
  const url = new URL(req.url);
  const light = url.searchParams.get("light") === "1"; // rows only, no fee reads (profile token list)
  const asTreasury = url.searchParams.get("as") === "treasury";
  const isTreasury = Boolean(MOJI_TREASURY) && address === MOJI_TREASURY.toLowerCase();
  if (asTreasury) {
    if (!isTreasury) return NextResponse.json({ error: "Connect the treasury wallet to see treasury fees" }, { status: 403 });
    const { data } = await sb.from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null).order("launched_at", { ascending: false }).limit(100);
    const rows = (data ?? []) as MojiRow[];
    const withFees = await Promise.all(
      rows.map(async (m) => {
        const [stockUsd, mojiUsd] = await Promise.all([stockPriceServer(m.chain_id, m.stock_address), mojiPriceUsd(m)]);
        const fees = await getMojiFees(m, { stockUsd, mojiUsd }, MOJI_TREASURY as Address);
        return { ...m, fees };
      }),
    );
    return NextResponse.json({ mojis: withFees, treasury: true });
  }
  const ors: string[] = [];
  if (did) ors.push(`creator_did.eq.${did}`);
  if (/^0x[0-9a-f]{40}$/.test(address)) ors.push(`creator_address.ilike.${address}`);
  const { data } = await sb.from("mojis").select("*").eq("network", NETWORK).or(ors.join(",")).order("launched_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as MojiRow[];
  if (light) return NextResponse.json({ mojis: rows, isTreasury });

  const withFees = await Promise.all(
    rows.map(async (m) => {
      const [stockUsd, mojiUsd] = await Promise.all([m.token_address ? stockPriceServer(m.chain_id, m.stock_address) : 0, mojiPriceUsd(m)]);
      const fees = await getMojiFees(m, { stockUsd, mojiUsd });
      return { ...m, fees };
    }),
  );
  return NextResponse.json({ mojis: withFees, isTreasury });
}
