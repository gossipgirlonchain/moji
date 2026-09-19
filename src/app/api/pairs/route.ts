import { NextResponse } from "next/server";
import { CHAINS } from "@/config/chains";
import { chainLaunchable, stockNumeraires, tokenNumeraires } from "@/lib/numeraire";
import { WALLET_CLAIMS_OPEN } from "@/config/limits";

export const dynamic = "force-dynamic";

/**
 * GET /api/pairs[?chainId=4663]
 * Every chain a moji can launch on and what it can pair against there, by ticker and address. The same
 * curated lists the launch page shows (src/config/stocks*.ts, src/config/tokens.ts). Nothing else is accepted.
 */
export async function GET(req: Request) {
  const want = Number(new URL(req.url).searchParams.get("chainId") ?? 0) || null;
  const chains = CHAINS.filter((c) => c.viem && (!want || c.chainId === want)).map((c) => {
    const live = chainLaunchable(c);
    const pick = (s: ReturnType<typeof stockNumeraires>[number], kind: "stock" | "token") => ({
      ticker: s.ticker,
      name: s.name,
      address: s.address,
      decimals: s.decimals,
      kind,
      issuer: s.issuer ?? null,
    });
    return {
      chainId: c.chainId,
      name: c.name,
      gasSymbol: c.gasSymbol,
      minGasNative: c.minGasNative,
      live,
      explorer: c.viem?.blockExplorers?.default.url ?? null,
      stocks: live ? stockNumeraires(c).filter((s) => s.available !== false).map((s) => pick(s, "stock")) : [],
      tokens: live ? tokenNumeraires(c).map((s) => pick(s, "token")) : [],
    };
  });
  if (want && chains.length === 0) return NextResponse.json({ error: "unknown chain", code: "CHAIN_NOT_LIVE" }, { status: 404 });
  return NextResponse.json({ walletClaimsOpen: WALLET_CLAIMS_OPEN, chains }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
