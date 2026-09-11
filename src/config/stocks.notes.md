# Robinhood Chain tokenized-stock research notes (2026-09-11)

## Where the LONG app gets its market list
- App: https://app.long.xyz (Next.js/Turbopack, wallet-gated behind "Get started" -> "Connect wallet").
- There is NO network request for the stock list. It is a hardcoded module (Turbopack id 677549, exports
  `ROBINHOOD_ASSETS`, `ROBINHOOD_LAUNCHABLE_ASSETS`, `ROBINHOOD_MOST_LIQUID_ASSETS`, `ROBINHOOD_QUICK_PICK_ASSETS`,
  `ROBINHOOD_STOCK_CATEGORIES`, `isAiNumeraire`, `isNvda3xNumeraire`) inside
  `https://app.long.xyz/_next/static/chunks/eef8fe6f010ab324.js` (chunk hash will change on deploy).
  Each entry: symbol, name, kind (native|stable|token|stock|etf), address (checksummed), decimals, Chainlink feedAddress (8 dec, 86400s heartbeat), flags {isNew, available}.
- Logos in LONG: `https://app.long.xyz/robinhood-coins/<ticker lowercase>.png` (all 63 stock/etf icons return 200 image/png in-browser; USDG and NVDAx3L 404).
  app.long.xyz is behind a Cloudflare bot challenge (curl gets 403), so hotlinking from a server is unreliable.
- Other endpoints seen in the bundle (not used for the Robinhood stock list):
  - `https://api.long.xyz/v1` and `${base}/graphql` (LONG token/pool data)
  - `https://api.mainnet.base.long.xyz/v1/market/tokens/{address}/stats` (Base side only)
  - `https://graph.codex.io/graphql` (Codex price data), coingecko price endpoints
  - RPC in bundle for 4663: `https://rpc.mainnet.chain.robinhood.com` and an Alchemy key `https://robinhood-mainnet.g.alchemy.com/v2/...`
  - Sentry/PostHog analytics tag `chain_key: 'robinhood', chain_id: 4663` (Base = 8453 under `/base` routes).
- LONG's Robinhood list = 63 stock/ETF tokens + 3 other numeraires (USDG stable, AI memecoin, NVDAx3L leveraged token, env-gated).
  BABA and CRCL carry `available:false` (hidden from the picker). "New" rail: SHOP, F, SNOW, RIVN, PFE, NBIS, LMT, JNJ.
  Most-liquid rail: AI, NVDA, AAPL, AMZN, GOOGL, META, SPCX, TSLA. Quick picks: AI, NVDA, TSLA, AAPL, SPY, AMZN.

## Official Robinhood registry (best canonical source)
- `GET https://api.robinhood.com/rhj/assets` (docs: https://docs.robinhood.com/chain/stock-token-apis) returns 194 assets with
  `tokenSymbol`, `tokenName`, `deployments[{contractAddress, chainId:4663}]`, `tokenDecimals:18`, `logoUrl` (https://cdn.robinhood.com/ncw_assets/logos/<lowercase address>.png), `currentMultiplier`, `isin`, trading status.
- Also `GET https://api.robinhood.com/rhj/prices/{symbol}` (bid/ask, 15s cache) and `/rhj/corporate-actions`. 60 req/s.
- Cross-check: all 63 LONG stock/ETF addresses match the RH registry exactly (0 mismatches, 0 missing).
  RH lists ~131 more 4663 tokens LONG does not expose (CRM, AVGO, SMCI, PANW, CRWD, UNH, XOM, VTI, SOXX, IONQ, RKLB, CLSK, EWY, RGTI ...).
- Saved raw: rh_assets.json, flattened: rh_assets_flat.json (this directory).

## Chain params for 4663 (with sources)
| Field | Value | Source |
|---|---|---|
| Chain ID | 4663 (0x1237; confirmed via eth_chainId) | https://docs.robinhood.com/chain/connecting, https://chainlist.org/chain/4663 |
| Network type | MAINNET (chainlist `isTestnet:false`; docs call it "Robinhood Chain" mainnet, Arbitrum Orbit L2 settling to Ethereum) | docs.robinhood.com/chain/connecting, chainlist rpcs.json |
| Public RPC | https://rpc.mainnet.chain.robinhood.com (rate-limited; requires a User-Agent header, bare curl gets 403) | docs.robinhood.com/chain/connecting |
| Other RPCs | https://robinhood-rpc.publicnode.com, https://robinhood.api.pocket.network, https://robinhood.rpc.blxrbdn.com, wss://robinhood-rpc.publicnode.com, Alchemy `robinhood-mainnet.g.alchemy.com/v2/{KEY}` | chainlist rpcs.json, docs.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com (official; also https://robinscan.io on chainlist). Beware lookalike explorers. | docs.robinhood.com/chain/connecting, chainlist, doppler-docs contract-addresses.md |
| Native gas token | ETH ("Ether", 18 dec) | docs.robinhood.com/chain ("Robinhood Chain uses ETH as its native gas token"), chainlist nativeCurrency |
| Testnet | Robinhood Chain Testnet, chainId 46630, RPC https://rpc.testnet.chain.robinhood.com, explorer https://explorer.testnet.chain.robinhood.com, faucet https://faucet.testnet.chain.robinhood.com, gas ETH | docs.robinhood.com/chain/connecting, chainlist |
| Stablecoin | USDG "Global Dollar" 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (6 dec) | LONG bundle + doppler-indexer robinhood.ts |
| WETH | 0x0bd7d308f8e1639fab988df18a8011f41eacad73 | doppler-indexer robinhood.ts |

## Doppler docs / Whetstone repos
- docs.doppler.lol has NO chains page (/reference/chains is 404) and NO tokenized stock list. Robinhood mentions are limited to:
  - reference/contract-addresses: "Robinhood Mainnet (4663)" table (Airlock 0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862, DopplerHookInitializer 0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544, RehypeDopplerHookInitializer 0x5f9eb5f6726fe88d5e39867967f5b833d2fa3215, UniswapV4Initializer 0x6cce158b6d1747617fc218592b4d60b239b957ea, etc.), explorer links to robinhoodchain.blockscout.com.
  - reference/quotes-and-swaps: use Universal Router v2.1.1 on Robinhood (4663), v2.0 elsewhere. UniversalRouter 0x8876789976decbfcbbbe364623c63652db8c0904, PoolManager 0x8366a39cc670b4001a1121b8f6a443a643e40951, StateView 0xf3334192d15450cdd385c8b70e03f9a6bd9e673b.
  - No RPC/gas-token info in Doppler docs; those come from Robinhood docs/chainlist above.
- whetstoneresearch/doppler-sdk: `CHAIN_IDS.ROBINHOOD = 4663` (src/evm/addresses.ts), deployments.generated.ts has the 4663 block; README says SDK does not export a viem chain for it.
- whetstoneresearch/doppler-indexer `src/config/chains/robinhood.ts`: the only Whetstone-published stock list. 34 `stockTokens` (only those with a Chainlink feed: AAPL AMD AMZN ASML BABA CLSK COIN CRCL CRWV EWY GME GOOGL INTC IONQ META MSFT MSTR MU NBIS NVDA ORCL PLTR QQQ RGTI RKLB SGOV SLV SNDK SPCX SPY TSLA TSM USAR USO), each with chainlinkOracle. Comment: every canonical Robinhood Stock Token is a BeaconProxy deployed by 0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046 with implementation 0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2; lookalike tokens exist. All 34 verified on-chain and all overlap LONG's list (CLSK, EWY, IONQ, RGTI, RKLB are in the indexer + RH registry but NOT in LONG's picker).
- whetstoneresearch/doppler-api: 4663 configured with auctionTypes static/multicurve/dynamic.
- No LONG app source repo under whetstoneresearch (LONG is a separate closed-source frontend).

## On-chain verification (eth_call to https://rpc.mainnet.chain.robinhood.com, selectors symbol() 0x95d89b41, name() 0x06fdde03, decimals() 0x313ce567, plus eth_getCode)
Result: 66/66 LONG entries verified (symbol matches, decimals match, bytecode present). Script: verify_all.py, raw: verify_all.json.

| LONG ticker | address | on-chain symbol | on-chain name | dec | OK |
|---|---|---|---|---|---|
| USDG | 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 | USDG | Global Dollar | 6 | yes |
| AI | 0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18 | AI | Artificial Inu | 18 | yes |
| NVDAx3L | 0xF51fb54DE60f6e16252E852A5Ed0E60B8307606A | NVDAx3L | NVDA 3x Long | 18 | yes |
| AAPL | 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9 | AAPL | Apple • Robinhood Token | 18 | yes |
| AMC | 0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B | AMC | AMC Entertainment • Robinhood Token | 18 | yes |
| AMD | 0x86923f96303D656E4aa86D9d42D1e57ad2023fdC | AMD | AMD • Robinhood Token | 18 | yes |
| AMZN | 0x12f190a9F9d7D37a250758b26824B97CE941bF54 | AMZN | Amazon • Robinhood Token | 18 | yes |
| ASML | 0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA | ASML | ASML Holding NV • Robinhood Token | 18 | yes |
| BA | 0x4D21483a44Bf67a86b77E3dA301411880797D452 | BA | Boeing • Robinhood Token | 18 | yes |
| BABA | 0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4 | BABA | Alibaba • Robinhood Token | 18 | yes |
| BB | 0x48E39E56aCdbA37b09020C0b734A613C9a2f100A | BB | Blackberry • Robinhood Token | 18 | yes |
| BE | 0x822CC93fFD030293E9842c30BBD678F530701867 | BE | Bloom Energy • Robinhood Token | 18 | yes |
| CCL | 0x9651342CeA770aE9a2969Ba2A52611523146aef9 | CCL | Carnival Corporation • Robinhood Token | 18 | yes |
| COIN | 0x6330D8C3178a418788dF01a47479c0ce7CCF450b | COIN | Coinbase • Robinhood Token | 18 | yes |
| COST | 0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2 | COST | Costco • Robinhood Token | 18 | yes |
| CRCL | 0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5 | CRCL | Circle Internet Group • Robinhood Token | 18 | yes |
| CRWV | 0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3 | CRWV | CoreWeave • Robinhood Token | 18 | yes |
| DELL | 0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd | DELL | Dell • Robinhood Token | 18 | yes |
| DJT | 0x1D11f0496982706C5e14A514D4E79F2e6BdE4516 | DJT | Trump Media & Technology Group • Robinhood Token | 18 | yes |
| F | 0x25C288E6D899b9BC30160965aD9644c67e73bE0C | F | Ford Motor • Robinhood Token | 18 | yes |
| FIG | 0x41F4267525a8AFf329540eF24fD83d9044758B33 | FIG | Figma • Robinhood Token | 18 | yes |
| GME | 0x1b0E319c6A659F002271B69dB8A7df2F911c153E | GME | GameStop • Robinhood Token | 18 | yes |
| GOOGL | 0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3 | GOOGL | Alphabet Class A • Robinhood Token | 18 | yes |
| HIMS | 0xCceE82fE024c36fA15E1005edE3E9e4787e23D09 | HIMS | Hims & Hers Health • Robinhood Token | 18 | yes |
| IBM | 0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619 | IBM | IBM • Robinhood Token | 18 | yes |
| INTC | 0xc72b96e0E48ecd4DC75E1e45396e26300BC39681 | INTC | Intel • Robinhood Token | 18 | yes |
| JNJ | 0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80 | JNJ | Johnson & Johnson • Robinhood Token | 18 | yes |
| LLY | 0x8005d266423c7ea827372c9c864491e5786600ea | LLY | Eli Lilly • Robinhood Token | 18 | yes |
| LMT | 0x329fcACEb9AD6F9580DD5F643fed0646900D043c | LMT | Lockheed • Robinhood Token | 18 | yes |
| LULU | 0x4e62068525Ab11FE768e29dfD00ef909B9803016 | LULU | Lululemon • Robinhood Token | 18 | yes |
| META | 0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35 | META | Meta Platforms • Robinhood Token | 18 | yes |
| MRNA | 0x43B07D15cE533bEc5476d70C22a78a1B2B662155 | MRNA | Moderna • Robinhood Token | 18 | yes |
| MSFT | 0xe93237C50D904957Cf27E7B1133b510C669c2e74 | MSFT | Microsoft • Robinhood Token | 18 | yes |
| MSTR | 0xec262a75e413fAfD0dF80480274532C79D42da09 | MSTR | Strategy Inc. • Robinhood Token | 18 | yes |
| MU | 0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD | MU | Micron Technology • Robinhood Token | 18 | yes |
| NBIS | 0x9D9c6684F596F66a64C030B93A886D51Fd4D7931 | NBIS | Nebius Group • Robinhood Token | 18 | yes |
| NET | 0x116F00968269B7bfbaD4109cE591d6E74c0601d4 | NET | Cloudflare, Inc. Class A common stock • Robinhood Token | 18 | yes |
| NFLX | 0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8 | NFLX | Netflix • Robinhood Token | 18 | yes |
| NU | 0x408c14038a04f7bD235329E26d2bf569ee20e250 | NU | Nu • Robinhood Token | 18 | yes |
| NVDA | 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC | NVDA | NVIDIA • Robinhood Token | 18 | yes |
| ORCL | 0xb0992820E760d836549ba69BC7598b4af75dEE03 | ORCL | Oracle • Robinhood Token | 18 | yes |
| PFE | 0x7066A64c24e4206CD62E83bf198c1E7EB361F51e | PFE | Pfizer • Robinhood Token | 18 | yes |
| PLTR | 0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A | PLTR | Palantir Technologies • Robinhood Token | 18 | yes |
| QUBT | 0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4 | QUBT | Quantum Computing • Robinhood Token | 18 | yes |
| RBLX | 0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8 | RBLX | Roblox • Robinhood Token | 18 | yes |
| RDDT | 0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C | RDDT | Reddit • Robinhood Token | 18 | yes |
| RIVN | 0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B | RIVN | Rivian Automotive • Robinhood Token | 18 | yes |
| SHOP | 0xF53F66751B1Eff985311b693531E3290F600c410 | SHOP | Shopify • Robinhood Token | 18 | yes |
| SKHY | 0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8 | SKHY | SK hynix Inc. American Depositary Shares • Robinhood Token | 18 | yes |
| SNAP | 0xF6589F11Bc40b669e584073F428B05562F568733 | SNAP | Snap • Robinhood Token | 18 | yes |
| SNDK | 0xB90A19fF0Af67f7779afF50A882A9CfF42446400 | SNDK | Sandisk Corporation • Robinhood Token | 18 | yes |
| SNOW | 0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E | SNOW | Snowflake • Robinhood Token | 18 | yes |
| SOFI | 0x98E75885157C80992A8D41b696D8c9C6Fb30A926 | SOFI | SoFi Technologies • Robinhood Token | 18 | yes |
| SPCX | 0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa | SPCX | Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token | 18 | yes |
| TSLA | 0x322F0929c4625eD5bAd873c95208D54E1c003b2d | TSLA | Tesla • Robinhood Token | 18 | yes |
| TSM | 0x58FfE4a942d3885bAa22D7520691F611EF09e7AA | TSM | Taiwan Semiconductor Manufacturing • Robinhood Token | 18 | yes |
| TTWO | 0x5e81213613b6B86EaB4c6c50d718d34359459786 | TTWO | Take-Two Interactive Software • Robinhood Token | 18 | yes |
| UPS | 0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2 | UPS | UPS • Robinhood Token | 18 | yes |
| USAR | 0xd917B029C761D264c6A312BBbcDA868658eF86a6 | USAR | USA Rare Earth • Robinhood Token | 18 | yes |
| GLD | 0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e | GLD | SPDR Gold Trust • Robinhood Token | 18 | yes |
| QQQ | 0xD5f3879160bc7c32ebb4dC785F8a4F505888de68 | QQQ | Invesco QQQ • Robinhood Token | 18 | yes |
| SGOV | 0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5 | SGOV | iShares 0-3 Month Treasury Bond • Robinhood Token | 18 | yes |
| SLV | 0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f | SLV | iShares Silver Trust • Robinhood Token | 18 | yes |
| SPY | 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C | SPY | SPDR S&P 500 ETF Trust • Robinhood Token | 18 | yes |
| USO | 0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344 | USO | United States Oil Fund • Robinhood Token | 18 | yes |
| XLK | 0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43 | XLK | State Street Technology Select Sector SPDR ETF • Robinhood Token | 18 | yes |

## Files
- stocks.ts: typed config (63 stocks/ETFs under chainId 4663 + ROBINHOOD_OTHER_NUMERAIRES + coming-soon chains).
- long_assets.tsv: raw LONG ROBINHOOD_ASSETS extraction. indexer_robinhood.ts: doppler-indexer chain config. rh_assets.json: official Robinhood registry.
