import { defineChain, type Chain } from "viem";
import { mainnet, arbitrum, base } from "viem/chains";

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
   * Chain staging. Only live chains are claimable; the rest render as disabled "soon" pills.
   * Flip this one flag to switch a chain on. Nothing else needs to change.
   */
  live: boolean;
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
    dexscreenerSlug: "robinhood",
    matchaSlug: "robinhood",
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
  },
  {
    key: "ethereum",
    chainId: 1,
    name: "Ethereum",
    short: "Ethereum",
    emoji: "💎",
    viem: mainnet,
    gasSymbol: mainnet.nativeCurrency.symbol,
    minGasNative: "0.01",
    live: false,
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
    minGasNative: "0.001",
    live: false,
    dexscreenerSlug: "arbitrum",
    matchaSlug: "arbitrum",
  },
  {
    key: "base",
    chainId: 8453,
    name: "Base",
    short: "Base",
    emoji: "🔵",
    viem: base,
    gasSymbol: base.nativeCurrency.symbol,
    minGasNative: "0.001",
    live: false,
    dexscreenerSlug: "base",
    matchaSlug: "base",
  },
  {
    key: "monad",
    chainId: 143,
    name: "Monad",
    short: "Monad",
    emoji: "🟪",
    gasSymbol: "MON",
    minGasNative: "0.1",
    live: false,
    dexscreenerSlug: "monad",
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
export const SUPPORTED_EVM_CHAINS = [robinhoodChain, base, arbitrum, mainnet] as const;
