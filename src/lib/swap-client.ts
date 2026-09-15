"use client";

import { encodeAbiParameters, encodeFunctionData, erc20Abi, formatUnits, maxUint160, maxUint256, parseAbi, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { computePoolId, getAddresses, v4QuoterAbi } from "@whetstone-research/doppler-sdk/evm";
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
const V4_SWAP = 0x10;
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
  return { router: a.universalRouter, quoter: a.uniswapV4Quoter, permit2: a.permit2, hooks: [a.dopplerHookInitializer, a.v4MulticurveInitializer, a.v4DecayMulticurveInitializer].filter(Boolean) as Address[] };
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
