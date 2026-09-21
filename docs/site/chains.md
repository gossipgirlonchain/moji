# Chains and pairs

Doppler's Airlock takes any ERC-20 as the numeraire, so a moji can pair against a tokenized stock or a token. The launch path is identical either way. `GET /api/pairs` is the live list; this is the shape of it.

| chain | id | gas | stocks | tokens |
|---|---|---|---|---|
| Robinhood Chain | 4663 | ETH | Robinhood Stock Tokens (the full list, AAPL to TSLA) | ETH (WETH), PONS, AI, CASHCAT, BONER, ZZZ, RAM, LLM, QUOTRON, ORBIO, HOOKR, MUSEBOOK |
| Base | 8453 | ETH | Coinbase tokenized stocks: AAPL, AMZN, GOOGL, META, MSFT, MSTR, NVDA, TSLA | ETH, AERO, VVV, VIRTUAL, NOCK, BNKR, CLANKER, TOSHI, DEGEN, ZORA, BASECAT, LAPTOP, BSTONK, IPOD, EARPODS, MEAT |
| BNB Chain | 56 | BNB | | BNB, CAKE, BTCB |
| Ethereum | 1 | ETH | soon | ETH, UNI, LINK, AAVE, PEPE, COMP, ONDO, LDO, ENA, APE |
| Arbitrum One | 42161 | ETH | soon | ETH, ARB, PENDLE, GMX, RAIN |
| Monad | 143 | MON | soon | soon |
| Solana | | SOL | soon | staged for the Solana build |

Only chains with `live: true` in `/api/pairs` accept launches. Every EVM address was verified on-chain and checked for real DEX liquidity; fake-liquidity pools were excluded.

## Prices

The launch curve and USD display use: Chainlink feeds on Robinhood Chain for stocks, then Robinhood's quote API, then Yahoo; the Doppler indexer for ETH and MON; Dexscreener for curated tokens.

## RPC

Robinhood Chain's public RPC (`https://rpc.mainnet.chain.robinhood.com`) rejects requests without a `User-Agent` header and rate-limits bursts. `https://robinhood-rpc.publicnode.com` is a fallback. Explorer: `https://robinhoodchain.blockscout.com`.

## Contracts on Robinhood Chain

| | |
|---|---|
| Universal Router (swaps) | `0x8876789976decbfcbbbe364623c63652db8c0904` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Doppler Airlock and the rest | from `@whetstone-research/doppler-sdk`'s `getAddresses(4663)` |
