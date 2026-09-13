import { NextResponse } from "next/server";
import { erc20Abi, formatUnits, isAddress, type Address } from "viem";
import { hasSupabase, supabaseServer, type MojiRow } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";
import { chainById } from "@/config/chains";
import { publicClientFor } from "@/lib/rpc";
import { findNumeraire, wethNumeraire } from "@/lib/numeraire";

export const dynamic = "force-dynamic";

export type Holding = { address: Address; symbol: string; label: string; decimals: number; balance: string; kind: "moji" | "stock" | "weth" };

/**
 * GET /api/me/holdings?address=0x…&chainId=4663
 * Every moji token, stock token and WETH on that chain the wallet holds a nonzero balance of.
 * One multicall over all known tokens, so tokens sent to the user show up, not just the ones they launched.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  const chainId = Number(url.searchParams.get("chainId") ?? 4663);
  const chain = chainById(chainId);
  if (!isAddress(address) || !chain?.viem || !hasSupabase()) return NextResponse.json({ holdings: [] });

  const sb = supabaseServer();
  const { data } = await sb.from("mojis").select("display, token_address, stock_ticker, stock_address").eq("network", NETWORK).eq("chain_id", chainId).not("token_address", "is", null).limit(1000);
  const rows = (data ?? []) as Pick<MojiRow, "display" | "token_address" | "stock_ticker" | "stock_address">[];

  const tokens = new Map<string, { address: Address; symbol: string; label: string; decimals: number; kind: Holding["kind"] }>();
  for (const r of rows) {
    const t = r.token_address!.toLowerCase();
    if (!tokens.has(t)) tokens.set(t, { address: r.token_address as Address, symbol: r.display, label: r.display, decimals: 18, kind: "moji" });
    const s = r.stock_address.toLowerCase();
    if (!tokens.has(s)) {
      const stock = findNumeraire(chainId, r.stock_address);
      const w = wethNumeraire(chain);
      const isWeth = w && w.address.toLowerCase() === s;
      tokens.set(s, {
        address: r.stock_address as Address,
        symbol: isWeth ? `W${chain.gasSymbol}` : r.stock_ticker,
        label: isWeth ? `W${chain.gasSymbol} · wrapped ${chain.gasSymbol}, unwraps 1:1` : `$${r.stock_ticker}`,
        decimals: stock?.decimals ?? 18,
        kind: isWeth ? "weth" : "stock",
      });
    }
  }
  const list = [...tokens.values()];
  if (list.length === 0) return NextResponse.json({ holdings: [] });

  const pc = publicClientFor(chain.viem);
  const results = await pc.multicall({
    contracts: list.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [address as Address] as const })),
    allowFailure: true,
  });
  const holdings: Holding[] = [];
  results.forEach((r, i) => {
    const bal = r.status === "success" ? (r.result as bigint) : 0n;
    if (bal > 0n) holdings.push({ ...list[i], balance: bal.toString() });
  });
  holdings.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "stock" || a.kind === "weth" ? -1 : 1));
  return NextResponse.json({ holdings, checked: list.length, formatted: holdings.map((h) => `${formatUnits(BigInt(h.balance), h.decimals)} ${h.symbol}`) }, { headers: { "cache-control": "no-store" } });
}
