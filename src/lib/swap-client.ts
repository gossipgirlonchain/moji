"use client";

import { encodeAbiParameters, encodeFunctionData, erc20Abi, formatUnits, maxUint160, maxUint256, parseAbi, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { computePoolId, getAddresses, quoterV2Abi, v4QuoterAbi } from "@whetstone-research/doppler-sdk/evm";
import { FEE_TICK_SPACING, MOJI_TREASURY } from "@/config/fees";

/**
 * In-app swaps for a moji pool: Uniswap v4 through Doppler's Universal Router deployment.
 * Stock <-> moji only (no ETH hop yet). Pool fees keep flowing to the launcher and treasury like any
 * other venue; APP_SWAP_FEE_BPS is an optional extra cut of the output paid to the treasury (0 = off).
 */
export const APP_SWAP_FEE_BPS = 50;
export const SLIPPAGE_BPS = 100;
const DYNAMIC_FEE_FLAG = 8388608;

// Uniswap v4 periphery Actions + Universal Router command ids.
const V3_SWAP_EXACT_IN = 0x00;
const WRAP_ETH = 0x0b;
const UNWRAP_WETH = 0x0c;
const V4_SWAP = 0x10;
const SETTLE = 0x0b;
const TAKE = 0x0e;
const MSG_SENDER = "0x0000000000000000000000000000000000000001" as Address;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;
const CONTRACT_BALANCE = 1n << 255n;
const OPEN_DELTA = 0n;
/** Deep stable on each chain, the hop between WETH and a stock when there is no direct pool. */
const STABLE: Record<number, Address> = {
  4663: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
  56: "0x55d398326f99059fF775485246999027B3197955", // USDT (BSC-USD), the deepest stable on BNB Chain
};
const V3_FEES = [100, 500, 3000, 10000];
/** Chains whose Universal Router is built on the older v4 periphery: the exact-in struct carries sqrtPriceLimitX96. Robinhood's is. */
const LEGACY_SWAP_STRUCT = new Set([4663]);
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;
const TAKE_PORTION = 0x10;

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
const POOL_KEY_ABI = { name: "poolKey", type: "tuple", components: [{ name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] } as const;

const routerAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const permit2Abi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

export function addressesFor(chainId: number) {
  const a = getAddresses(chainId) as unknown as Record<string, Address | undefined>;
  return { router: a.universalRouter, quoter: a.uniswapV4Quoter, v3Quoter: a.v3Quoter, v3Factory: a.uniswapV3Factory, weth: a.weth, permit2: a.permit2, hooks: [a.dopplerHookInitializer, a.v4MulticurveInitializer, a.v4DecayMulticurveInitializer].filter(Boolean) as Address[] };
}

/** Reconstruct the pool key and check it hashes to the pool id we recorded at launch. */
export function poolKeyFor(chainId: number, asset: Address, numeraire: Address, poolId: Hex): PoolKey | null {
  const [currency0, currency1] = asset.toLowerCase() < numeraire.toLowerCase() ? [asset, numeraire] : [numeraire, asset];
  for (const hooks of addressesFor(chainId).hooks) {
    const key = { currency0, currency1, fee: DYNAMIC_FEE_FLAG, tickSpacing: FEE_TICK_SPACING, hooks };
    if (computePoolId(key).toLowerCase() === poolId.toLowerCase()) return key;
  }
  return null;
}

export async function quoteExactIn(pc: PublicClient, chainId: number, key: PoolKey, tokenIn: Address, amountIn: bigint): Promise<bigint> {
  const { quoter } = addressesFor(chainId);
  if (!quoter) throw new Error("no quoter on this chain");
  const zeroForOne = tokenIn.toLowerCase() === key.currency0.toLowerCase();
  const { result } = await pc.simulateContract({ address: quoter, abi: v4QuoterAbi, functionName: "quoteExactInputSingle", args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }] });
  return (result as readonly [bigint, bigint])[0];
}

/** Universal Router calldata: one exact-in v4 swap, settle input via Permit2, optional treasury portion, take the rest. */
export function encodeSwap(chainId: number, key: PoolKey, tokenIn: Address, tokenOut: Address, amountIn: bigint, minOut: bigint, feeBps = APP_SWAP_FEE_BPS): Hex {
  const zeroForOne = tokenIn.toLowerCase() === key.currency0.toLowerCase();
  const actions: number[] = [SWAP_EXACT_IN_SINGLE, SETTLE_ALL];
  const params: Hex[] = [
    LEGACY_SWAP_STRUCT.has(chainId)
      ? encodeAbiParameters(
          [{ type: "tuple", components: [POOL_KEY_ABI, { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "sqrtPriceLimitX96", type: "uint160" }, { name: "hookData", type: "bytes" }] }],
          [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n, hookData: "0x" }],
        )
      : encodeAbiParameters(
          [{ type: "tuple", components: [POOL_KEY_ABI, { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "hookData", type: "bytes" }] }],
          [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" }],
        ),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [tokenIn, amountIn]),
  ];
  if (feeBps > 0 && /^0x[0-9a-fA-F]{40}$/.test(MOJI_TREASURY)) {
    actions.push(TAKE_PORTION);
    params.push(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [tokenOut, MOJI_TREASURY, BigInt(feeBps)]));
  }
  actions.push(TAKE_ALL);
  params.push(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [tokenOut, minOut]));
  const actionsHex = ("0x" + actions.map((a) => a.toString(16).padStart(2, "0")).join("")) as Hex;
  const v4Input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actionsHex, params]);
  const commands = ("0x" + V4_SWAP.toString(16).padStart(2, "0")) as Hex;
  return encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, [v4Input], BigInt(Math.floor(Date.now() / 1000) + 600)] });
}

/** Make sure Permit2 can pull `token` for the router: ERC-20 approve to Permit2 once, then a Permit2 allowance to the router. */
export async function ensureAllowances(pc: PublicClient, wc: WalletClient, chainId: number, owner: Address, token: Address, amount: bigint, onStep?: (s: string) => void): Promise<void> {
  const { router, permit2 } = addressesFor(chainId);
  if (!router || !permit2) throw new Error("no router on this chain");
  const erc = await pc.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, permit2] });
  if (erc < amount) {
    onStep?.("approve token");
    const h = await wc.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [permit2, maxUint256], account: owner, chain: wc.chain });
    await pc.waitForTransactionReceipt({ hash: h });
  }
  const [allowed, expiration] = await pc.readContract({ address: permit2, abi: permit2Abi, functionName: "allowance", args: [owner, token, router] });
  const now = Math.floor(Date.now() / 1000);
  if (allowed < amount || Number(expiration) <= now + 60) {
    onStep?.("allow swaps");
    const h = await wc.writeContract({ address: permit2, abi: permit2Abi, functionName: "approve", args: [token, router, maxUint160, now + 30 * 24 * 3600], account: owner, chain: wc.chain });
    await pc.waitForTransactionReceipt({ hash: h });
  }
}

export async function sendSwap(pc: PublicClient, wc: WalletClient, chainId: number, owner: Address, data: Hex): Promise<Hex> {
  const { router } = addressesFor(chainId);
  const hash = await wc.sendTransaction({ to: router!, data, account: owner, chain: wc.chain });
  await pc.waitForTransactionReceipt({ hash });
  return hash;
}

export function fmtAmount(wei: bigint, decimals: number, max = 6): string {
  const n = Number(formatUnits(wei, decimals));
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 0.01 ? max : 4 });
}

// ---------------------------------------------------------------------------------------------
// ETH in / ETH out: a Uniswap v3 leg between WETH and the stock (direct pool, or via the chain's
// stable), chained with the v4 moji pool inside one Universal Router call.

export type V3Route = { tokens: Address[]; fees: number[] };

const v3FactoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const v3PoolAbi = parseAbi(["function liquidity() view returns (uint128)"]);
const routeCache = new Map<string, Promise<V3Route[]>>();

async function bestFee(pc: PublicClient, factory: Address, a: Address, b: Address): Promise<number | null> {
  let best: { fee: number; liq: bigint } | null = null;
  for (const fee of V3_FEES) {
    const pool = await pc.readContract({ address: factory, abi: v3FactoryAbi, functionName: "getPool", args: [a, b, fee] }).catch(() => null);
    if (!pool || pool === "0x0000000000000000000000000000000000000000") continue;
    const liq = await pc.readContract({ address: pool, abi: v3PoolAbi, functionName: "liquidity" }).catch(() => 0n);
    if (liq > 0n && (!best || liq > best.liq)) best = { fee, liq };
  }
  return best?.fee ?? null;
}

/** Candidate v3 routes from WETH to `stock`: direct, and via the stable. Cached per stock. */
export function v3RoutesFor(pc: PublicClient, chainId: number, stock: Address): Promise<V3Route[]> {
  const k = `${chainId}:${stock.toLowerCase()}`;
  let p = routeCache.get(k);
  if (!p) {
    p = (async () => {
      const { v3Factory, weth } = addressesFor(chainId);
      if (!v3Factory || !weth) return [];
      const out: V3Route[] = [];
      const direct = await bestFee(pc, v3Factory, weth, stock);
      if (direct) out.push({ tokens: [weth, stock], fees: [direct] });
      const stable = STABLE[chainId];
      if (stable) {
        const [f1, f2] = await Promise.all([bestFee(pc, v3Factory, weth, stable), bestFee(pc, v3Factory, stable, stock)]);
        if (f1 && f2) out.push({ tokens: [weth, stable, stock], fees: [f1, f2] });
      }
      return out;
    })();
    routeCache.set(k, p);
  }
  return p;
}

function encodePath(tokens: Address[], fees: number[]): Hex {
  let hex = "0x";
  for (let i = 0; i < tokens.length; i++) {
    hex += tokens[i].slice(2).toLowerCase();
    if (i < fees.length) hex += fees[i].toString(16).padStart(6, "0");
  }
  return hex as Hex;
}

async function quoteV3(pc: PublicClient, chainId: number, path: Hex, amountIn: bigint): Promise<bigint> {
  const { v3Quoter } = addressesFor(chainId);
  if (!v3Quoter) throw new Error("no v3 quoter");
  const { result } = await pc.simulateContract({ address: v3Quoter, abi: quoterV2Abi, functionName: "quoteExactInput", args: [path, amountIn] });
  return (result as readonly [bigint, ...unknown[]])[0];
}

export type EthQuote = { route: V3Route; stockAmount: bigint; out: bigint };

/** ETH -> stock (best v3 route by output) -> moji. */
export async function quoteEthToMoji(pc: PublicClient, chainId: number, key: PoolKey, stock: Address, amountEth: bigint): Promise<EthQuote | null> {
  const routes = await v3RoutesFor(pc, chainId, stock);
  let best: EthQuote | null = null;
  for (const route of routes) {
    try {
      const stockAmount = await quoteV3(pc, chainId, encodePath(route.tokens, route.fees), amountEth);
      const out = await quoteExactIn(pc, chainId, key, stock, stockAmount);
      if (!best || out > best.out) best = { route, stockAmount, out };
    } catch {}
  }
  return best;
}

/** moji -> stock -> ETH (best v3 route by output). */
export async function quoteMojiToEth(pc: PublicClient, chainId: number, key: PoolKey, moji: Address, stock: Address, amountMoji: bigint, feeBps = APP_SWAP_FEE_BPS): Promise<EthQuote | null> {
  const routes = await v3RoutesFor(pc, chainId, stock);
  const stockOut = await quoteExactIn(pc, chainId, key, moji, amountMoji);
  const stockAfterFee = stockOut - (stockOut * BigInt(feeBps)) / 10_000n;
  let best: EthQuote | null = null;
  for (const route of routes) {
    try {
      const rev = { tokens: [...route.tokens].reverse(), fees: [...route.fees].reverse() };
      const out = await quoteV3(pc, chainId, encodePath(rev.tokens, rev.fees), stockAfterFee);
      if (!best || out > best.out) best = { route: rev, stockAmount: stockOut, out };
    } catch {}
  }
  return best;
}

const feeOk = (feeBps: number) => feeBps > 0 && /^0x[0-9a-fA-F]{40}$/.test(MOJI_TREASURY);
const swapParamsAbi = (chainId: number) =>
  LEGACY_SWAP_STRUCT.has(chainId)
    ? [{ type: "tuple", components: [POOL_KEY_ABI, { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "sqrtPriceLimitX96", type: "uint160" }, { name: "hookData", type: "bytes" }] }] as const
    : [{ type: "tuple", components: [POOL_KEY_ABI, { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "hookData", type: "bytes" }] }] as const;
function encodeSwapSingle(chainId: number, key: PoolKey, zeroForOne: boolean, amountIn: bigint, minOut: bigint): Hex {
  const v = LEGACY_SWAP_STRUCT.has(chainId) ? { poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n, hookData: "0x" as Hex } : { poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" as Hex };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return encodeAbiParameters(swapParamsAbi(chainId) as any, [v]);
}
const actionsHex = (a: number[]) => ("0x" + a.map((x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
const cmdHex = actionsHex;
function execute(commands: Hex, inputs: Hex[]): Hex {
  return encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, inputs, BigInt(Math.floor(Date.now() / 1000) + 600)] });
}

/** Buy moji with native ETH: WRAP -> v3 to the stock (kept in the router) -> v4 settle from the router's balance -> moji to the user. */
export function encodeEthBuy(chainId: number, key: PoolKey, route: V3Route, stock: Address, moji: Address, amountEth: bigint, minOut: bigint, feeBps = APP_SWAP_FEE_BPS): Hex {
  const zeroForOne = stock.toLowerCase() === key.currency0.toLowerCase();
  const actions = [SETTLE, SWAP_EXACT_IN_SINGLE];
  const params: Hex[] = [
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], [stock, CONTRACT_BALANCE, false]),
    encodeSwapSingle(chainId, key, zeroForOne, OPEN_DELTA, minOut),
  ];
  if (feeOk(feeBps)) {
    actions.push(TAKE_PORTION);
    params.push(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [moji, MOJI_TREASURY, BigInt(feeBps)]));
  }
  actions.push(TAKE_ALL);
  params.push(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [moji, minOut]));
  const inputs: Hex[] = [
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [ADDRESS_THIS, amountEth]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], [ADDRESS_THIS, amountEth, 0n, encodePath(route.tokens, route.fees), false]),
    encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actionsHex(actions), params]),
  ];
  return execute(cmdHex([WRAP_ETH, V3_SWAP_EXACT_IN, V4_SWAP]), inputs);
}

/** Sell moji for native ETH: v4 moji -> stock into the router (treasury portion first) -> v3 to WETH -> unwrap to the user. */
export function encodeEthSell(chainId: number, key: PoolKey, route: V3Route, stock: Address, moji: Address, amountMoji: bigint, minOut: bigint, feeBps = APP_SWAP_FEE_BPS): Hex {
  const zeroForOne = moji.toLowerCase() === key.currency0.toLowerCase();
  const actions = [SWAP_EXACT_IN_SINGLE, SETTLE_ALL];
  const params: Hex[] = [encodeSwapSingle(chainId, key, zeroForOne, amountMoji, 0n), encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [moji, amountMoji])];
  if (feeOk(feeBps)) {
    actions.push(TAKE_PORTION);
    params.push(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [stock, MOJI_TREASURY, BigInt(feeBps)]));
  }
  actions.push(TAKE);
  params.push(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [stock, ADDRESS_THIS, OPEN_DELTA]));
  const inputs: Hex[] = [
    encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actionsHex(actions), params]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], [ADDRESS_THIS, CONTRACT_BALANCE, 0n, encodePath(route.tokens, route.fees), false]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [MSG_SENDER, minOut]),
  ];
  return execute(cmdHex([V4_SWAP, V3_SWAP_EXACT_IN, UNWRAP_WETH]), inputs);
}

export async function sendSwapWithValue(pc: PublicClient, wc: WalletClient, chainId: number, owner: Address, data: Hex, value: bigint): Promise<Hex> {
  const { router } = addressesFor(chainId);
  const hash = await wc.sendTransaction({ to: router!, data, value, account: owner, chain: wc.chain });
  await pc.waitForTransactionReceipt({ hash });
  return hash;
}
