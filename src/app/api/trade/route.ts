import { NextResponse } from "next/server";
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { getMoji } from "@/lib/data";
import { validateCombo } from "@/lib/emoji";
import { chainById } from "@/config/chains";
import { findNumeraire } from "@/lib/numeraire";
import { publicClientFor } from "@/lib/rpc";
import { SITE_URL } from "@/lib/network";
import { MOJI_TREASURY } from "@/config/fees";
import { APP_SWAP_FEE_BPS, SLIPPAGE_BPS, addressesFor, encodeEthBuy, encodeEthSell, encodeSwap, neededApprovals, poolKeyFor, quoteEthToMoji, quoteExactIn, quoteMojiToEth } from "@/lib/swap-client";

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
  const v = validateCombo(q.get(side) ?? "");
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
  const stock = findNumeraire(chainId, m.stock_address);
  const stockDecimals = stock?.decimals ?? 18;
  const moji = m.token_address as Address;
  const stockAddr = m.stock_address as Address;
  const key = poolKeyFor(chainId, moji, stockAddr, m.pool_id as Hex);
  if (!key) return fail("Could not rebuild this pool's key", "NO_POOL", 500);
  const { router } = addressesFor(chainId);
  if (!router) return fail("No router on this chain", "CHAIN_NOT_LIVE", 400);

  const inIsEth = via === "eth" && side === "buy";
  const outIsEth = via === "eth" && side === "sell";
  const tokenIn = side === "buy" ? stockAddr : moji;
  const tokenOut = side === "buy" ? moji : stockAddr;
  const decIn = side === "buy" ? (inIsEth ? 18 : stockDecimals) : 18;
  const decOut = side === "buy" ? 18 : outIsEth ? 18 : stockDecimals;
  const symIn = side === "buy" ? (inIsEth ? chain.gasSymbol : m.stock_ticker) : m.display;
  const symOut = side === "buy" ? m.display : outIsEth ? chain.gasSymbol : m.stock_ticker;

  let amountIn: bigint;
  try {
    amountIn = parseUnits(q.get("amount") ?? "", decIn);
  } catch {
    return fail("amount must be a decimal number in whole units of what you spend", "BAD_INPUT", 400);
  }
  if (amountIn <= 0n) return fail("amount must be positive", "BAD_INPUT", 400);

  const pc = publicClientFor(chain.viem);
  try {
    let quote: bigint;
    let data: Hex;
    let value = 0n;
    let route: string[] | null = null;
    if (via === "eth") {
      const eq = side === "buy" ? await quoteEthToMoji(pc, chainId, key, stockAddr, amountIn) : await quoteMojiToEth(pc, chainId, key, moji, stockAddr, amountIn);
      if (!eq) return fail(`No ${chain.gasSymbol} route to ${m.stock_ticker} on ${chain.name}; trade with via=stock`, "NO_ROUTE", 400);
      quote = eq.out;
      const minOut = (quote * BigInt(10_000 - slippageBps)) / 10_000n;
      data = side === "buy" ? encodeEthBuy(chainId, key, eq.route, stockAddr, moji, amountIn, minOut) : encodeEthSell(chainId, key, eq.route, stockAddr, moji, amountIn, minOut);
      if (side === "buy") value = amountIn;
      route = eq.route.tokens;
    } else {
      quote = await quoteExactIn(pc, chainId, key, tokenIn, amountIn);
      const minOut = (quote * BigInt(10_000 - slippageBps)) / 10_000n;
      data = encodeSwap(chainId, key, tokenIn, tokenOut, amountIn, minOut);
    }
    const minOut = (quote * BigInt(10_000 - slippageBps)) / 10_000n;
    const [approvals, balance] = await Promise.all([
      inIsEth ? Promise.resolve([]) : neededApprovals(pc, chainId, from, tokenIn, amountIn),
      inIsEth ? pc.getBalance({ address: from }) : pc.readContract({ address: tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [from] }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        side,
        via,
        moji: { display: m.display, ticker: m.stock_ticker, chainId, tokenAddress: moji, pairAddress: stockAddr, poolId: m.pool_id, page: pageFor(m.display, m.stock_ticker, chainId) },
        in: { token: inIsEth ? null : tokenIn, symbol: symIn, decimals: decIn, amount: formatUnits(amountIn, decIn), amountWei: amountIn.toString() },
        out: { token: outIsEth ? null : tokenOut, symbol: symOut, decimals: decOut, quote: formatUnits(quote, decOut), quoteWei: quote.toString(), minWei: minOut.toString(), slippageBps },
        route,
        fee: { appBps: APP_SWAP_FEE_BPS, treasury: MOJI_TREASURY || null, note: "the pool's own swap fee (1%, 75% in the first 16s after launch) is paid inside the pool to the creator, treasury and protocol" },
        balance: { wei: balance.toString(), enough: balance >= amountIn },
        approvals,
        tx: { chainId, from, to: router, data, value: value.toString(), deadlineSeconds: 600 },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    return fail(`Could not quote this trade: ${msg.split("\n")[0].slice(0, 240)}`, "QUOTE_FAILED", 502);
  }
}
