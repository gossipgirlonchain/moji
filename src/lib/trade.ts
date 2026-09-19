import "server-only";
import { erc20Abi, type Address, type Hex } from "viem";
import type { MojiRow } from "./supabase";
import { chainById } from "@/config/chains";
import { findNumeraire } from "./numeraire";
import { publicClientFor } from "./rpc";
import { SLIPPAGE_BPS, addressesFor, encodeEthBuy, encodeEthSell, encodeSwap, neededApprovals, poolKeyFor, quoteEthToMoji, quoteExactIn, quoteMojiToEth, type ApprovalTx } from "./swap-client";

export class TradeError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

export type TradeSide = "buy" | "sell";
export type TradeVia = "stock" | "eth";

export type BuiltTrade = {
  side: TradeSide;
  via: TradeVia;
  chainId: number;
  tokenIn: Address | null;
  tokenOut: Address | null;
  decIn: number;
  decOut: number;
  symIn: string;
  symOut: string;
  amountIn: bigint;
  quote: bigint;
  minOut: bigint;
  slippageBps: number;
  route: Address[] | null;
  balance: bigint;
  approvals: ApprovalTx[];
  tx: { to: Address; data: Hex; value: bigint };
};

/**
 * One swap through a moji's own pool, as calldata for `from` to sign: live quote, the Permit2 approvals still
 * needed, and the Universal Router call. `buy` spends the paired stock (or native ETH with via=eth) for the moji,
 * `sell` the reverse. `amountIn` is in wei of what is spent. Shared by GET /api/trade and the copy engine.
 */
export async function buildTrade(input: { m: MojiRow; side: TradeSide; via?: TradeVia; from: Address; amountIn: bigint; slippageBps?: number }): Promise<BuiltTrade> {
  const { m, side, from, amountIn } = input;
  const via: TradeVia = input.via === "eth" ? "eth" : "stock";
  const slippageBps = input.slippageBps ?? SLIPPAGE_BPS;
  const chain = chainById(m.chain_id);
  if (!chain?.viem) throw new TradeError("Unknown chain", "CHAIN_NOT_LIVE", 400);
  if (!m.token_address || !m.pool_id) throw new TradeError(`${m.display} is not launched on that pair`, "NOT_FOUND", 404);
  if (amountIn <= 0n) throw new TradeError("amount must be positive", "BAD_INPUT", 400);
  const chainId = chain.chainId;
  const stockDecimals = findNumeraire(chainId, m.stock_address)?.decimals ?? 18;
  const moji = m.token_address as Address;
  const stockAddr = m.stock_address as Address;
  const key = poolKeyFor(chainId, moji, stockAddr, m.pool_id as Hex);
  if (!key) throw new TradeError("Could not rebuild this pool's key", "NO_POOL", 500);
  const { router } = addressesFor(chainId);
  if (!router) throw new TradeError("No router on this chain", "CHAIN_NOT_LIVE", 400);

  const inIsEth = via === "eth" && side === "buy";
  const outIsEth = via === "eth" && side === "sell";
  const tokenIn = side === "buy" ? stockAddr : moji;
  const tokenOut = side === "buy" ? moji : stockAddr;
  const decIn = side === "buy" ? (inIsEth ? 18 : stockDecimals) : 18;
  const decOut = side === "buy" ? 18 : outIsEth ? 18 : stockDecimals;
  const symIn = side === "buy" ? (inIsEth ? chain.gasSymbol : m.stock_ticker) : m.display;
  const symOut = side === "buy" ? m.display : outIsEth ? chain.gasSymbol : m.stock_ticker;

  const pc = publicClientFor(chain.viem);
  let quote: bigint;
  let data: Hex;
  let value = 0n;
  let route: Address[] | null = null;
  try {
    if (via === "eth") {
      const eq = side === "buy" ? await quoteEthToMoji(pc, chainId, key, stockAddr, amountIn) : await quoteMojiToEth(pc, chainId, key, moji, stockAddr, amountIn);
      if (!eq) throw new TradeError(`No ${chain.gasSymbol} route to ${m.stock_ticker} on ${chain.name}; trade with via=stock`, "NO_ROUTE", 400);
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
  } catch (e) {
    if (e instanceof TradeError) throw e;
    const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    throw new TradeError(`Could not quote this trade: ${msg.split("\n")[0].slice(0, 240)}`, "QUOTE_FAILED", 502);
  }
  const minOut = (quote * BigInt(10_000 - slippageBps)) / 10_000n;
  const [approvals, balance] = await Promise.all([
    inIsEth ? Promise.resolve([] as ApprovalTx[]) : neededApprovals(pc, chainId, from, tokenIn, amountIn),
    inIsEth ? pc.getBalance({ address: from }) : pc.readContract({ address: tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [from] }),
  ]);
  return { side, via, chainId, tokenIn: inIsEth ? null : tokenIn, tokenOut: outIsEth ? null : tokenOut, decIn, decOut, symIn, symOut, amountIn, quote, minOut, slippageBps, route, balance, approvals, tx: { to: router, data, value } };
}
