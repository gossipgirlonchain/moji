# Tokenized US stocks/ETFs on Ethereum, Arbitrum, Base, Monad (researched 2026-09-11)

Deliverable: `stocks-multichain.ts` (same dir) exporting `STOCKS_1`, `STOCKS_42161`, `STOCKS_8453`, `STOCKS_143` plus `STOCK_CHAINS`.
Sidecar: `stocks-multichain.supply.json` (same entries + on-chain totalSupply as string), `stocks-multichain.verification.md` (full per-token verification table).
TS note: each `STOCKS_<chain>` is `[...chunk0, ...chunk1, ...]` of <=300-entry `const` arrays, because a single 1000+ element object-literal array trips TS2590 (union too complex). Type-checked clean with `tsc -p tsconfig.check.json` (strict, isolated).
Working files: `src/` (raw source lists, `ver_*.json` raw eth_call results, `verify.py`, `assemble.py`).

## TL;DR

| Chain | Entries | Issuers (count) | Nonzero supply |
|---|---|---|---|
| Ethereum (1) | 1447 | backed 752, ondo 450, dinari 165, anchored 80 | backed 752, ondo 447, dinari 18, anchored 3 |
| Arbitrum One (42161) | 1054 | backed 723, dinari 251, anchored 80 | backed 723, dinari 233, anchored 7 |
| Base (8453) | 327 | dinari 247, anchored 80 | dinari 227, anchored 20 |
| Monad (143) | 80 | anchored 80 | anchored 67 |

Real issuers on these chains: **Anchored Finance** (all 4 chains, identical addresses), **Ondo Global Markets** (Ethereum only), **Backed Finance xStocks** (Ethereum + Arbitrum, NOT Base), **Dinari dShares** (Ethereum, Arbitrum, Base).
Not real / not applicable: **Robinhood** (4663 only), **Bitget** (not an issuer; its "Bitget Onchain" stock trading is Ondo tokens on ETH/BSC/SOL), **Backed bTokens** (bCSPX/bNVDA etc. are the older Backed product line, superseded by xStocks; not included, see below).

Every included address was verified on-chain (symbol/name/decimals/totalSupply via batched `eth_call`), 100% success on every list. All tokens are 18 decimals.

## Chain metadata (verified)

| chainId | Name | Gas | RPC used (eth_chainId verified) | Explorer | Dexscreener slug | Matcha slug |
|---|---|---|---|---|---|---|
| 1 | Ethereum | ETH | https://ethereum-rpc.publicnode.com (eth.llamarpc.com returns HTML/525, avoid) | https://etherscan.io | `ethereum` (seen in API results) | `ethereum` (matcha llms.txt example URL) |
| 42161 | Arbitrum One | ETH | https://arb1.arbitrum.io/rpc (429s on heavy batches; https://arbitrum-one-rpc.publicnode.com used for bulk) | https://arbiscan.io | `arbitrum` (seen in API results) | `arbitrum` (browser-rendered "Swap USDC on Arbitrum") |
| 8453 | Base | ETH | https://mainnet.base.org (batch JSON-RPC returned empty results; https://base-rpc.publicnode.com used for bulk) | https://basescan.org | `base` (seen in API results) | `base` (browser-rendered "Swap USDC on Base") |
| 143 | Monad | MON (chainid.network: name "Monad", symbol MON, 18 dec) | https://rpc.monad.xyz (QuickNode-backed, 50 req/s limit; monad-rpc.publicnode.com is 404) | https://monadscan.com (200) and https://monadvision.com (chainlist first entry, 403 to curl but official) | `monad` (search results show chainId "monad", WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A, USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603) | `monad` (browser-rendered "Swap WMON on Monad") |

Dexscreener: Dinari dShares on Base have tiny pairs (NVDA/AAPL/RIOT, ~$50 liq). Anchored tokens have NO Dexscreener pairs on any of the 4 chains as of today (tokens/v1 returns []); Monad trading happens on Monday Trade (dexId `monday-trade` exists on Dexscreener but no aStock pairs indexed). Ondo tokens have Uniswap pools on Ethereum (AAPLon ~$10-25k, NVDAon ~$106k).

## Sources checked

### 1. Robinhood (skip for these chains)
- `GET https://api.robinhood.com/rhj/assets` re-fetched live: 194 assets, every `deployments[]` entry is `chainId: 4663` ("Robinhood Chain"). Zero on 1/42161/8453/143.
- History: EU "Classic Stock Tokens" launched on Arbitrum One 2025-06-30, ~2,000 permissioned contracts by Dec 2025, migrated to Robinhood Chain (mainnet 2026-07-01). Those Arbitrum contracts were transfer-restricted and are not in the registry; no official list exists, so nothing included.

### 2. Dinari dShares (real on 1, 42161, 8453)
- Docs (`docs.dinari.com/docs/blockchain.md`): supported = Ethereum 1, Arbitrum 42161, Avalanche 43114, Base 8453, HyperEVM 999, HyperCore, Plume 98866. Blast/Kinto deprecated.
- Enumeration: `DShareFactory` contracts (from `dinaricrypto/sbt-deployments` v0.4.0 + DefiLlama `projects/dinari/index.js` for Base):
  - Ethereum `0x60B5E7eEcb2AEE0382db86491b8cFfA39347c747`
  - Arbitrum `0xB4Ca72eA4d072C779254269FD56093D3ADf603b8`
  - Base `0xBCE6410A175a1C9B1a25D38d7e1A900F8393BC4D`
  - `getDShares()` (0xbe6c84af) REVERTS on all three production factories (upgraded implementation). Enumerated instead via `DShareAdded(address indexed dShare, address indexed wrappedDShare, string indexed symbol, string name)` logs, topic0 `0xfc5890ef646a4c681cf9479ed23b38d3d92fe3b32166aee1e9ebd394a45a0824` (Arbitrum via arb1 RPC eth_getLogs, Ethereum + Base via Blockscout logs API).
  - Result: 165 (ETH), 251 (ARB), 247 (BASE) dShare addresses (wrapped dShares excluded). All verified. Names are "<Company> - Dinari"; on-chain symbol is the bare ticker (AAPL, NVDA...).
  - v1.0.0 factory `0x4cdBd5A0938BE8c57DED76880f774db67dc915A9` on 1/42161/8453 is labeled **staging** (2 and 4 test tokens) and was ignored.
- Dinari's own API (`api-enterprise.sbt.dinari.com/api/v2/market_data/stocks/`) needs an API key (401), so factory logs are the source of truth.
- Caveats: Ethereum dShares are mostly unminted (147/165 zero supply). Arbitrum/Base are the live inventory. Includes US-listed ADRs (BABA, JD, NIO, PDD, TCEHY, SHEL, NVO, ASML), preferreds (STRK/STRF/STRD/STRC), a warrant (RBOT.WS), and three `.d` tickers (GME.d, PLTR.d) which appear to be re-issued tokens alongside the plain-ticker ones; kept with `symbolOnChain` so the caller can filter.

### 3. Ondo Global Markets (real on Ethereum only)
- Official token list: `github.com/ondoprotocol/ondo-global-markets-token-list/tokenlist.json` (v12): 904 tokens = 452 on chain 1 + 452 on BNB (56). Nothing on Arbitrum/Base/Monad. Solana exists but out of scope.
- Included 450 on Ethereum (excluded USDon stable and USDY). All verified; 447 have nonzero supply. Symbols `<TICKER>on`, names "<Company> (Ondo Tokenized)". Ondo logo CDN: `https://cdn.ondo.finance/tokens/logos/<symbol lowercase>_160x160.png`.
- Matcha lists them (browser-rendered "Swap AAPLon on Ethereum").

### 4. Backed Finance xStocks (real on Ethereum + Arbitrum; NOT on Base)
- Authoritative list: public API `https://api.xstocks.fi/api/v2/public/assets?page=N&pageSize=100` (found in `backed-fi/cowswap-xstocks-tokenlist/update-tokenlist.js`). 832 assets with `underlyingSymbol`, `underlyingIsin`, `underlying.listingCountry`, per-network `deployments[]`.
  - Network counts: Ethereum 832, Arbitrum 803, BNB 832, Optimism 832, Ink 832, XLayer 832, Mantle 824, HyperEVM 804, Solana 832, Ton 832, Tron 74. **Base: 0.**
  - EVM addresses are identical across EVM chains for a given asset (CREATE2-style), so the Arbitrum address equals the Ethereum address.
- Filter applied: US-listed only (`listingCountry == 'US'` or ISIN starts with `US`): 752 on ETH, 723 on ARB. Excluded 160 rows (80 assets x 2 chains) with HK/CN/KY/GB/IT/NL... underlyings (Bank of China, Meituan, Prada, NatWest, SHEIN pre-IPO, etc.), listed in `src/assemble_notes.json` under `backed_nonus_excluded`.
- Symbols `<TICKER>x`, names "<Company> xStock". JPSTx is `isTradingHalted: true` on both chains (kept, flagged). All 752/723 have nonzero supply. Note `supportsAtomicSwaps` is false on Arbitrum for most; the CoW tokenlist subsets (690 ETH / 168 ARB) are the atomic-swap-enabled ones.
- Backed **bTokens** (bCSPX `0x1e2c4fb7ede391d116e6b41cd0608260e8801d59` ETH / `0xC3cE78B037DDA1B966D31EC7979d3f3a38571A8E` Base, bNVDA `0xA34C5e0AbE843E10461E2C9586Ea03E55Dbcc495` ETH, bIB01, bCOIN...) are the legacy product line (DefiLlama `projects/backed`). Not included: xStocks superseded them, and bTokens are mostly Swiss-law certificates on bonds/indices rather than the stock tokens the launcher wants. If you want bCSPX/bCOIN/bNVDA on Base/ETH, those three addresses above are from DefiLlama and would need the same eth_call verification (not done).

### 5. Anchored Finance aStocks (real on all four chains, incl. Monad)
- Docs: `https://docs.anchored.finance/getting-started/anchored-tokens.md` lists 80 tokenized stocks/ETFs + 3 funds (aDHF, aLSF, aAIF, Ethereum-only, excluded). "Each address is identical on Ethereum, Monad, Base, and Arbitrum." 18 decimals. Issuer Anchored Capital Ltd, FINRA broker-dealer custody; launched Monad 2026-04-16 via Monday Trade, Arbitrum 2026-08-24 via Uniswap/UniswapX.
- Verified 80/80 on each of 1, 42161, 8453, 143 (same address, symbol `a<TICKER>`, name "<Company> aStock").
- Supply reality: Monad is the live venue (67/80 nonzero, aAMZN ~50, aAAPL ~44 tokens). Ethereum 3, Arbitrum 7, Base 20 nonzero, all sub-1-token amounts. No Dexscreener pairs anywhere yet.

### 6. Bitget / Monad other
- Bitget: "Bitget Onchain" tokenized stocks are powered by Ondo (ETH/BSC/SOL/Base/Morph per Bitget support). No Bitget-issued tokens, nothing on Arbitrum. Not an issuer.
- Monad: only Anchored. Dexscreener `monad` search shows no other stock-like tokens. Crypto.com's tokenized stocks (Aug 2026) are not on Monad.

## Logos
- `/stocks/<TICKER>.png` used for the 64 tickers present in `/Users/winny/moji/public/stocks/`.
- Otherwise `https://financialmodelingprep.com/image-stock/<TICKER>.png`, each checked with curl (1047 tickers checked, 200 image/png). Failures (logo left as issuer CDN URL or empty string): SPCG (Anchored, no FMP), GME.d / PLTR.d / RBOT.WS / MPJPY (Dinari oddities, empty), DGXX / FSOL / JMKE (Ondo, fell back to Ondo CDN URL). `BRK.B` resolved via FMP `BRK-B`.

## Kind classification
`kind: 'etf'` via ticker allowlist + name keywords (ETF, Fund, Trust, iShares, SPDR, Vanguard, ProShares, Direxion, 2x/3x, Bitcoin Strategy, ...). Heuristic; spot-checked but not exhaustive.

## Ambiguities / decisions to flag
1. Duplicated tickers per chain are intentional: e.g. Ethereum has AAPL from ondo (AAPLon), backed (AAPLx), dinari (AAPL), anchored (aAAPL). Entries are unique by address; disambiguate in UI by `issuer`.
2. Zero-supply tokens are included (Dinari ETH 147, Anchored ETH 77 / ARB 73 / BASE 60 / MONAD 13, Ondo 3). Filter on `stocks-multichain.supply.json` if you only want mintable-and-minted inventory.
3. Backed non-US filter is based on their API's `listingCountry`/ISIN; 11 assets with `listingCountry: null` but US ISINs (XRX, FLNC, WGS, QUBT, AI, ...) were kept.
4. Basescan and monadvision return 403 to curl (bot protection) but are the canonical explorers.
5. `eth.llamarpc.com` and `base.llamarpc.com` were unusable (HTML / 525). `mainnet.base.org` silently returns no results for batched JSON-RPC arrays; use `base-rpc.publicnode.com` for batches.
6. Robinhood-on-Arbitrum tokens (2025) exist as ~2,000 contracts by a Robinhood deployer but are permissioned and undocumented; deliberately not included.
