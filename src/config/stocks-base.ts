// Coinbase Tokenized Stocks on Base (issued by Coinbase Onchain SPV Ltd). Verified on-chain 2026-09-12:
// symbol/name/decimals (8) and live DEX liquidity on Aerodrome + Uniswap V4.
import type { Stock } from "./stocks-types";

const c = (ticker: string, name: string, address: string): Stock => ({ ticker, name, address: address as `0x${string}`, logo: `/stocks/${ticker}.png`, decimals: 8, kind: "stock", issuer: "coinbase", symbolOnChain: `${ticker}c` });

export const STOCKS_8453: Stock[] = [
  c("AAPL", "Apple", "0xb200000000000000000000c2e324d24d7eecd1fb"),
  c("AMZN", "Amazon", "0xb200000000000000000000d9192b6b456483c2e8"),
  c("GOOGL", "Alphabet", "0xb2000000000000000000002d0ba3164cc74f58b7"),
  c("META", "Meta Platforms", "0xb2000000000000000000008bc8786b856e61707c"),
  c("MSFT", "Microsoft", "0xb200000000000000000000ab99cfa739e253872b"),
  c("MSTR", "Strategy", "0xb2000000000000000000004884b426556b92883d"),
  c("NVDA", "NVIDIA", "0xb20000000000000000000078ee7ce2fe4908108c"),
  c("TSLA", "Tesla", "0xb2000000000000000000001e800a7f5189430cd0"),
];
