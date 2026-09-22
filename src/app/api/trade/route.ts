import { NextResponse } from "next/server";
import { formatUnits, parseUnits, type Address } from "viem";
import { getMoji } from "@/lib/data";
import { validateCombo } from "@/lib/emoji";
import { isMemeCombo, validateMeme } from "@/lib/meme-coin";
import { chainById } from "@/config/chains";
import { findNumeraire } from "@/lib/numeraire";
import { SITE_URL } from "@/lib/network";
import { MOJI_TREASURY } from "@/config/fees";
import { APP_SWAP_FEE_BPS, SLIPPAGE_BPS } from "@/lib/swap-client";
import { TradeError, buildTrade } from "@/lib/trade";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const fail = (error: string, code: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, code, ...extra }, { status });
const pageFor = (display: string, ticker: string, chainId: number) => `${SITE_URL}/m/${encodeURIComponent(display)}/${encodeURIComponent(ticker)}${chainId !== 4663 ? `/${chainId}` : ""}`;

/**
 * GET /api/trade?buy=🍏🤖&pair=AAPL&amount=2&from=0x…[&chainId=4663][&via=stock|eth][&slippageBps=100]
 * GET /api/trade?sell=🍏🤖&pair=AAPL&amount=1000&from=0x…[…]
 *
 * One swap through the moji's own Doppler pool, as calldata for `from` to sign. `buy` spends the paired stock (or
 * native ETH with `via=eth`, through a v3 leg) and receives the moji; `sell` spends the moji and receives the stock
 * (or ETH). `amount` is in whole units of what you spend. The quote is live from the Uniswap v4 quoter; `tx` carries
 * `minOut` at `slippageBps` and a 10-minute deadline, so fetch it right before sending. Send `approvals` first
 * (in order, each confirmed) when the list is not empty; they are one-time per token. Nothing to record afterwards:
 * the swap is on-chain and the feed reads it from there.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const side = q.has("buy") ? "buy" : q.has("sell") ? "sell" : null;
  if (!side) return fail("Pass buy=<combo> or sell=<combo>", "BAD_INPUT", 400);
  const what = q.get(side) ?? "";
  // `$PEPE` trades a meme; anything else is an emoji combo.
  const v = isMemeCombo(what) ? validateMeme({ name: "meme", symbol: what }) : validateCombo(what);
  if (!v.ok) return fail(v.reason, "BAD_COMBO", 400);
  const chainId = Number(q.get("chainId") ?? 4663);
  const chain = chainById(chainId);
  if (!chain?.viem) return fail("Unknown chain", "CHAIN_NOT_LIVE", 400);
  const from = (q.get("from") ?? "") as Address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(from)) return fail("from must be the 0x address that will send the swap", "BAD_INPUT", 400);
  const via = q.get("via") === "eth" ? "eth" : "stock";
  const slippageBps = Number(q.get("slippageBps") ?? SLIPPAGE_BPS);
  if (!Number.isFinite(slippageBps) || slippageBps < 1 || slippageBps > 5000) return fail("slippageBps must be 1 to 5000", "BAD_INPUT", 400);

  const m = await getMoji(v.display, q.get("pair"), chainId);
  if (!m || !m.token_address || !m.pool_id) return fail(`${v.display} is not launched on that pair`, "NOT_FOUND", 404);
  const stockDecimals = findNumeraire(chainId, m.stock_address)?.decimals ?? 18;
  const decIn = side === "buy" ? (via === "eth" ? 18 : stockDecimals) : 18;
  let amountIn: bigint;
  try {
    amountIn = parseUnits(q.get("amount") ?? "", decIn);
  } catch {
    return fail("amount must be a decimal number in whole units of what you spend", "BAD_INPUT", 400);
  }
  if (amountIn <= 0n) return fail("amount must be positive", "BAD_INPUT", 400);

  try {
    const t = await buildTrade({ m, side, via, from, amountIn, slippageBps });
    return NextResponse.json(
      {
        ok: true,
        side,
        via,
        moji: { display: m.display, ticker: m.stock_ticker, chainId, tokenAddress: m.token_address, pairAddress: m.stock_address, poolId: m.pool_id, page: pageFor(m.display, m.stock_ticker, chainId) },
        in: { token: t.tokenIn, symbol: t.symIn, decimals: t.decIn, amount: formatUnits(t.amountIn, t.decIn), amountWei: t.amountIn.toString() },
        out: { token: t.tokenOut, symbol: t.symOut, decimals: t.decOut, quote: formatUnits(t.quote, t.decOut), quoteWei: t.quote.toString(), minWei: t.minOut.toString(), slippageBps: t.slippageBps },
        route: t.route,
        fee: { appBps: APP_SWAP_FEE_BPS, treasury: MOJI_TREASURY || null, note: "the pool's own swap fee (1%, 75% in the first 16s after launch) is paid inside the pool to the creator, treasury and protocol" },
        balance: { wei: t.balance.toString(), enough: t.balance >= t.amountIn },
        approvals: t.approvals,
        tx: { chainId, from, to: t.tx.to, data: t.tx.data, value: t.tx.value.toString(), deadlineSeconds: 600 },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof TradeError) return fail(e.message, e.code, e.status);
    return fail(e instanceof Error ? e.message : String(e), "QUOTE_FAILED", 502);
  }
}
