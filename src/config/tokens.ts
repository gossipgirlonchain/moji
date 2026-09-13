// Curated non-stock pairs per chain. Every EVM address verified on-chain (symbol/name/decimals) and every
// entry checked for real DEX liquidity on 2026-09-12 (fake-liquidity pools excluded). Prices come from
// Dexscreener since these have no oracle. Solana entries are canonical mints, for the Solana build.
import type { Stock } from "./stocks-types";

export type TokenPair = Stock & { priceSource: "dexscreener"; dexChain: string };

const t = (dexChain: string, ticker: string, name: string, address: string, decimals = 18, logo?: string): TokenPair => ({
  ticker,
  name,
  address: address as `0x${string}`,
  decimals,
  logo: logo ?? `https://dd.dexscreener.com/ds-data/tokens/${dexChain}/${address.toLowerCase()}.png`,
  kind: "stock",
  issuer: "doppler",
  priceSource: "dexscreener",
  dexChain,
});

export const TOKENS: Record<number, TokenPair[]> = {
  4663: [
    t("robinhood", "PONS", "Pons", "0x39dBED3a2bd333467115dE45665cC57F813C4571"),
    t("robinhood", "AI", "Artificial Inu", "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18"),
    t("robinhood", "PERPSPAD", "Perps Pad", "0xa34CB9fC73B8634a50688A724cd0E78afbf41204", 9),
  ],
  8453: [
    t("base", "AERO", "Aerodrome", "0x940181a94A35A4569E4529A3CDfB74e38FD98631"),
    t("base", "VVV", "Venice Token", "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf"),
    t("base", "VIRTUAL", "Virtual Protocol", "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b"),
    t("base", "NOCK", "Nock", "0x9B5E262cF9bb04869ab40b19AF91D2dc85761722", 16),
    t("base", "BNKR", "BankrCoin", "0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b"),
    t("base", "CLANKER", "tokenbot", "0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb"),
    t("base", "BRETT", "Brett", "0x532f27101965dd16442E59d40670FaF5eBB142E4"),
    t("base", "TOSHI", "Toshi", "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4"),
    t("base", "DEGEN", "Degen", "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"),
  ],
  1: [
    t("ethereum", "UNI", "Uniswap", "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"),
    t("ethereum", "LINK", "Chainlink", "0x514910771AF9Ca656af840dff83E8264EcF986CA"),
    t("ethereum", "AAVE", "Aave", "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9"),
    t("ethereum", "PEPE", "Pepe", "0x6982508145454Ce325dDbE47a25d4ec3d2311933"),
    t("ethereum", "COMP", "Compound", "0xc00e94Cb662C3520282E6f5717214004A7f26888"),
    t("ethereum", "ONDO", "Ondo", "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3"),
    t("ethereum", "LDO", "Lido DAO", "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32"),
    t("ethereum", "ENA", "Ethena", "0x57e114B691Db790C35207b2e685D4A43181e6061"),
  ],
  42161: [
    t("arbitrum", "ARB", "Arbitrum", "0x912CE59144191C1204E64559FE8253a0e49E6548"),
    t("arbitrum", "PENDLE", "Pendle", "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8"),
    t("arbitrum", "GMX", "GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"),
    t("arbitrum", "RAIN", "RAIN", "0x25118290e6A5f4139381D072181157035864099d"),
  ],
};

/** Solana mints for the Solana build (chain stays "soon" until the Solana Doppler SDK is wired). */
export const SOLANA_TOKENS = [
  { ticker: "PENGU", name: "Pudgy Penguins", mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv" },
  { ticker: "PUMP", name: "Pump", mint: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn" },
  { ticker: "WIF", name: "dogwifhat", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { ticker: "BONK", name: "Bonk", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { ticker: "JUP", name: "Jupiter", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { ticker: "TRUMP", name: "Official Trump", mint: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN" },
  { ticker: "FARTCOIN", name: "Fartcoin", mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump" },
  { ticker: "POPCAT", name: "Popcat", mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr" },
  { ticker: "RAY", name: "Raydium", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },
  { ticker: "JTO", name: "Jito", mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" },
  // ZCAT and ANSEM: no canonical mint confirmed yet; add once verified.
] as const;

export function tokensFor(chainId: number): TokenPair[] {
  return TOKENS[chainId] ?? [];
}
