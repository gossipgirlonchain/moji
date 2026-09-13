import { defineChain, type Chain } from "viem";
import { mainnet, arbitrum, base, monad } from "viem/chains";

/**
 * Robinhood Chain (chainId 4663).
 * RPC + explorer per docs.robinhood.com/chain/connecting (also listed in docs.doppler.lol contract addresses).
 * Gas token is ETH: "Robinhood Chain uses ETH as its native gas token" (Arbitrum Orbit L2 settling to Ethereum).
 * The UI reads the symbol from `nativeCurrency.symbol`, never a hardcoded string.
 * Testnet: chainId 46630, https://rpc.testnet.chain.robinhood.com (no Doppler deployment in the SDK).
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
        "https://robinhood-rpc.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
  // Canonical Multicall3 (verified deployed on 4663). The Doppler SDK batches pending-fee reads through it.
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: false,
});

export type ChainKey = "robinhood" | "solana" | "ethereum" | "arbitrum" | "base" | "monad";

export type MojiChain = {
  key: ChainKey;
  chainId: number;
  name: string;
  short: string;
  emoji: string;
  /** viem chain, only for EVM chains we can launch on */
  viem?: Chain;
  /** Native gas token symbol. Driven from viem nativeCurrency when available. */
  gasSymbol: string;
  /** Minimum native balance we require before enabling LAUNCH (fallback when simulation is unavailable). */
  minGasNative: string;
  /**
   * Chain staging. Only live chains with stock inventory are claimable; the rest render as disabled "soon" pills.
   * Flip this one flag to switch a chain on. Nothing else needs to change.
   */
  live: boolean;
  /**
   * What mojis pair against here. "stock": a tokenized stock from the curated list (Robinhood Chain, LONG's list).
   * "weth": the chain's WETH from Doppler's address map, as in every Doppler docs launch example.
   */
  numeraire: "stock" | "weth";
  /** Dexscreener chain slug */
  dexscreenerSlug?: string;
  /** Matcha chain slug */
  matchaSlug?: string;
};

export const CHAINS: MojiChain[] = [
  {
    key: "robinhood",
    chainId: 4663,
    name: "Robinhood Chain",
    short: "Robinhood",
    emoji: "🪶",
    viem: robinhoodChain,
    gasSymbol: robinhoodChain.nativeCurrency.symbol,
    minGasNative: "0.0005",
    live: true,
    numeraire: "stock",
    dexscreenerSlug: "robinhood",
    matchaSlug: "robinhood",
  },
  {
    key: "base",
    chainId: 8453,
    name: "Base",
    short: "Base",
    emoji: "🔵",
    viem: base,
    gasSymbol: base.nativeCurrency.symbol,
    numeraire: "weth",
    minGasNative: "0.0005",
    live: true,
    dexscreenerSlug: "base",
    matchaSlug: "base",
  },
  {
    key: "ethereum",
    chainId: 1,
    name: "Ethereum",
    short: "Ethereum",
    emoji: "💎",
    viem: mainnet,
    gasSymbol: mainnet.nativeCurrency.symbol,
    numeraire: "weth",
    minGasNative: "0.005",
    live: true,
    dexscreenerSlug: "ethereum",
    matchaSlug: "ethereum",
  },
  {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum",
    short: "Arbitrum",
    emoji: "🔷",
    viem: arbitrum,
    gasSymbol: arbitrum.nativeCurrency.symbol,
    numeraire: "weth",
    minGasNative: "0.0005",
    live: false,
    dexscreenerSlug: "arbitrum",
    matchaSlug: "arbitrum",
  },
  {
    key: "monad",
    chainId: 143,
    name: "Monad",
    short: "Monad",
    emoji: "🟪",
    viem: monad,
    gasSymbol: monad.nativeCurrency.symbol,
    numeraire: "weth",
    minGasNative: "0.5",
    live: false,
    dexscreenerSlug: "monad",
    matchaSlug: "monad",
  },
  {
    key: "solana",
    chainId: 0,
    name: "Solana",
    short: "Solana",
    emoji: "🟣",
    gasSymbol: "SOL",
    minGasNative: "0.01",
    live: false,
    numeraire: "weth",
  },
];

export const DEFAULT_CHAIN = CHAINS[0];

export function chainById(chainId: number): MojiChain | undefined {
  return CHAINS.find((c) => c.chainId === chainId);
}
export function chainByKey(key: ChainKey): MojiChain {
  return CHAINS.find((c) => c.key === key) ?? DEFAULT_CHAIN;
}

/** EVM chains Privy/wagmi should know about. Robinhood is default. */
export const SUPPORTED_EVM_CHAINS = [robinhoodChain, base, arbitrum, mainnet, monad] as const;

/** Chains a launch can actually happen on: live flag AND a viem definition. Stock inventory is checked separately. */
export const LAUNCHABLE_CHAIN_IDS = CHAINS.filter((c) => c.live && c.viem).map((c) => c.chainId);
