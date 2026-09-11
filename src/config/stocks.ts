// Tokenized stock markets, mirroring the LONG app (app.long.xyz) market list on Robinhood Chain.
//
// Source of truth: LONG frontend bundle, module `ROBINHOOD_ASSETS` in
//   https://app.long.xyz/_next/static/chunks/eef8fe6f010ab324.js  (hardcoded; no network call)
// Cross-checked: 63/63 addresses match Robinhood's official registry
//   GET https://api.robinhood.com/rhj/assets  (chainId 4663 deployments)
// On-chain verified (eth_call symbol()/name()/decimals() via https://rpc.mainnet.chain.robinhood.com):
//   66/66 entries OK (see stocks.notes.md next to this file).
// Logos: official Robinhood CDN (https://cdn.robinhood.com/ncw_assets/logos/<lowercase address>.png).
//   LONG's own icons live at https://app.long.xyz/robinhood-coins/<lowercase ticker>.png but that host
//   sits behind a Cloudflare bot challenge, so do not hotlink them from a server.
// Every Robinhood Stock Token is an 18-decimal ERC-20 BeaconProxy; on-chain name() is "<Company> • Robinhood Token".
// Generated 2026-09-11.

export type Stock = {
  ticker: string
  name: string
  address: `0x${string}`
  logo: string
  decimals: number
  /** 'stock' or 'etf' (LONG's `kind`) */
  kind?: 'stock' | 'etf'
  /** Chainlink USD price feed proxy on Robinhood Chain (8 dec), when one exists */
  chainlinkFeed?: `0x${string}`
  /** LONG marks a few tokens available:false and hides them from its picker */
  available?: boolean
}

export type ChainStocks = {
  chainId: number
  key: 'robinhood' | 'solana' | 'ethereum' | 'arbitrum' | 'base' | 'monad'
  name: string
  comingSoon?: boolean
  stocks: Stock[]
}

export const ROBINHOOD_CHAIN = {
  chainId: 4663,
  name: 'Robinhood Chain',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  testnet: { chainId: 46630, rpcUrl: 'https://rpc.testnet.chain.robinhood.com', explorerUrl: 'https://explorer.testnet.chain.robinhood.com' },
} as const

export const ROBINHOOD_STOCKS: Stock[] = [
  { ticker: 'AAPL', name: "Apple", address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x6B22A786bAa607d76728168703a39Ea9C99f2cD0' },
  { ticker: 'AMC', name: "AMC Entertainment", address: '0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x05a3d1cd21d0c88145e82600e62e7e496e0f222b.png', decimals: 18, kind: 'stock' },
  { ticker: 'AMD', name: "Advanced Micro Devices", address: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72' },
  { ticker: 'AMZN', name: "Amazon", address: '0x12f190a9F9d7D37a250758b26824B97CE941bF54', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C' },
  { ticker: 'ASML', name: "ASML Holding", address: '0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x47f93d52cbec7c6d2cfc080e154002370a60daea.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xB4106147E8cce40b7d46124090d373A71b70f87D' },
  { ticker: 'BA', name: "Boeing", address: '0x4D21483a44Bf67a86b77E3dA301411880797D452', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x4d21483a44bf67a86b77e3da301411880797d452.png', decimals: 18, kind: 'stock' },
  { ticker: 'BABA', name: "Alibaba", address: '0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xad25ac6c84d497db898fa1e8387bf6af3532a1c4.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984', available: false },  // hidden in LONG UI (available:false)
  { ticker: 'BB', name: "BlackBerry", address: '0x48E39E56aCdbA37b09020C0b734A613C9a2f100A', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x48e39e56acdba37b09020c0b734a613c9a2f100a.png', decimals: 18, kind: 'stock' },
  { ticker: 'BE', name: "Bloom Energy", address: '0x822CC93fFD030293E9842c30BBD678F530701867', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x822cc93ffd030293e9842c30bbd678f530701867.png', decimals: 18, kind: 'stock' },
  { ticker: 'CCL', name: "Carnival", address: '0x9651342CeA770aE9a2969Ba2A52611523146aef9', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x9651342cea770ae9a2969ba2a52611523146aef9.png', decimals: 18, kind: 'stock' },
  { ticker: 'COIN', name: "Coinbase", address: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xA3a468A452940B7D6b69991207B508c609a98Ef2' },
  { ticker: 'COST', name: "Costco", address: '0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x4ea005168d7f09a7a0ba9d1def21a479950e44c2.png', decimals: 18, kind: 'stock' },
  { ticker: 'CRCL', name: "Circle", address: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a', available: false },  // hidden in LONG UI (available:false)
  { ticker: 'CRWV', name: "CoreWeave", address: '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x5f10a1c971b69e47e059e1dc91901b59b3fb49c3.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C' },
  { ticker: 'DELL', name: "Dell", address: '0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x941ae714ec6d8130c7b75d67160ca08f1e7d11dd.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b' },
  { ticker: 'DJT', name: "Trump Media", address: '0x1D11f0496982706C5e14A514D4E79F2e6BdE4516', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x1d11f0496982706c5e14a514d4e79f2e6bde4516.png', decimals: 18, kind: 'stock' },
  { ticker: 'F', name: "Ford Motor", address: '0x25C288E6D899b9BC30160965aD9644c67e73bE0C', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x25c288e6d899b9bc30160965ad9644c67e73be0c.png', decimals: 18, kind: 'stock' },
  { ticker: 'FIG', name: "Figma", address: '0x41F4267525a8AFf329540eF24fD83d9044758B33', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x41f4267525a8aff329540ef24fd83d9044758b33.png', decimals: 18, kind: 'stock' },
  { ticker: 'GME', name: "GameStop", address: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x1b0e319c6a659f002271b69db8a7df2f911c153e.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x27C71df6A64fB476468EdF256CF72c038baB5B67' },
  { ticker: 'GOOGL', name: "Alphabet", address: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xF6f373a037c30F0e5010d854385cA89185AE638b' },
  { ticker: 'HIMS', name: "Hims & Hers", address: '0xCceE82fE024c36fA15E1005edE3E9e4787e23D09', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xccee82fe024c36fa15e1005ede3e9e4787e23d09.png', decimals: 18, kind: 'stock' },
  { ticker: 'IBM', name: "IBM", address: '0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x980dcf6766fa79f5cf0c4aadb3ab477ff15a9619.png', decimals: 18, kind: 'stock' },
  { ticker: 'INTC', name: "Intel", address: '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x3f390C5C24628Ac7C489515402235FeAD71D1913' },
  { ticker: 'JNJ', name: "Johnson & Johnson", address: '0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x03dfbbe0ac4e7bcdafd08ed41a400326b77d8c80.png', decimals: 18, kind: 'stock' },
  { ticker: 'LLY', name: "Eli Lilly", address: '0x8005d266423c7ea827372c9c864491e5786600ea', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x8005d266423c7ea827372c9c864491e5786600ea.png', decimals: 18, kind: 'stock' },
  { ticker: 'LMT', name: "Lockheed Martin", address: '0x329fcACEb9AD6F9580DD5F643fed0646900D043c', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x329fcaceb9ad6f9580dd5f643fed0646900d043c.png', decimals: 18, kind: 'stock' },
  { ticker: 'LULU', name: "Lululemon", address: '0x4e62068525Ab11FE768e29dfD00ef909B9803016', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x4e62068525ab11fe768e29dfd00ef909b9803016.png', decimals: 18, kind: 'stock' },
  { ticker: 'META', name: "Meta", address: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x7C38C00C30BEe9378381E7B6135d7283356D71b1' },
  { ticker: 'MRNA', name: "Moderna", address: '0x43B07D15cE533bEc5476d70C22a78a1B2B662155', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x43b07d15ce533bec5476d70c22a78a1b2b662155.png', decimals: 18, kind: 'stock' },
  { ticker: 'MSFT', name: "Microsoft", address: '0xe93237C50D904957Cf27E7B1133b510C669c2e74', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E' },
  { ticker: 'MSTR', name: "Strategy", address: '0xec262a75e413fAfD0dF80480274532C79D42da09', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xec262a75e413fafd0df80480274532c79d42da09.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x396118bdFB181e6240E74D243F266B061c0edc3D' },
  { ticker: 'MU', name: "Micron", address: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x425EEFdCf05ed6526C3cE61Af99429A228a6d596' },
  { ticker: 'NBIS', name: "Nebius Group", address: '0x9D9c6684F596F66a64C030B93A886D51Fd4D7931', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x9d9c6684f596f66a64c030b93a886d51fd4d7931.png', decimals: 18, kind: 'stock' },
  { ticker: 'NET', name: "Cloudflare", address: '0x116F00968269B7bfbaD4109cE591d6E74c0601d4', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x116f00968269b7bfbad4109ce591d6e74c0601d4.png', decimals: 18, kind: 'stock' },
  { ticker: 'NFLX', name: "Netflix", address: '0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8.png', decimals: 18, kind: 'stock' },
  { ticker: 'NU', name: "Nu Holdings", address: '0x408c14038a04f7bD235329E26d2bf569ee20e250', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x408c14038a04f7bd235329e26d2bf569ee20e250.png', decimals: 18, kind: 'stock' },
  { ticker: 'NVDA', name: "NVIDIA", address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15' },
  { ticker: 'ORCL', name: "Oracle", address: '0xb0992820E760d836549ba69BC7598b4af75dEE03', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xb0992820e760d836549ba69bc7598b4af75dee03.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844' },
  { ticker: 'PFE', name: "Pfizer", address: '0x7066A64c24e4206CD62E83bf198c1E7EB361F51e', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x7066a64c24e4206cd62e83bf198c1e7eb361f51e.png', decimals: 18, kind: 'stock' },
  { ticker: 'PLTR', name: "Palantir", address: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x820ABedFF239034956B7A9d2F0a331f9F075eB4c' },
  { ticker: 'QUBT', name: "Quantum Computing", address: '0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x59818904ab4ce163b3ce4ffb64f2d6ca02c434b4.png', decimals: 18, kind: 'stock' },
  { ticker: 'RBLX', name: "Roblox", address: '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xf0c4bf4c582cb3836e98394b1d4e7b7281101be8.png', decimals: 18, kind: 'stock' },
  { ticker: 'RDDT', name: "Reddit", address: '0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x05b37fb53a299a1b874a619e1c4c404d52c36f4c.png', decimals: 18, kind: 'stock' },
  { ticker: 'RIVN', name: "Rivian", address: '0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xb1bf26c1d20ff267a4f93550d1e0d06ac40a114b.png', decimals: 18, kind: 'stock' },
  { ticker: 'SHOP', name: "Shopify", address: '0xF53F66751B1Eff985311b693531E3290F600c410', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xf53f66751b1eff985311b693531e3290f600c410.png', decimals: 18, kind: 'stock' },
  { ticker: 'SKHY', name: "SK hynix", address: '0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x84cab63bc87912e71ad199ff14a0ba45de68fef8.png', decimals: 18, kind: 'stock' },
  { ticker: 'SNAP', name: "Snap", address: '0xF6589F11Bc40b669e584073F428B05562F568733', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xf6589f11bc40b669e584073f428b05562f568733.png', decimals: 18, kind: 'stock' },
  { ticker: 'SNDK', name: "SanDisk", address: '0xB90A19fF0Af67f7779afF50A882A9CfF42446400', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xb90a19ff0af67f7779aff50a882a9cff42446400.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xfb133Fa4B7b385802B693a293606682Df47109A3' },
  { ticker: 'SNOW', name: "Snowflake", address: '0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xba0cab75495255d0cb58e22b648bfed4ecd1f47e.png', decimals: 18, kind: 'stock' },
  { ticker: 'SOFI', name: "SoFi Technologies", address: '0x98E75885157C80992A8D41b696D8c9C6Fb30A926', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x98e75885157c80992a8d41b696d8c9c6fb30a926.png', decimals: 18, kind: 'stock' },
  { ticker: 'SPCX', name: "SpaceX", address: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb' },
  { ticker: 'TSLA', name: "Tesla", address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x4A1166a659A55625345e9515b32adECea5547C38' },
  { ticker: 'TSM', name: "Taiwan Semiconductor", address: '0x58FfE4a942d3885bAa22D7520691F611EF09e7AA', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x58ffe4a942d3885baa22d7520691f611ef09e7aa.png', decimals: 18, kind: 'stock', chainlinkFeed: '0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F' },
  { ticker: 'TTWO', name: "Take-Two Interactive", address: '0x5e81213613b6B86EaB4c6c50d718d34359459786', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x5e81213613b6b86eab4c6c50d718d34359459786.png', decimals: 18, kind: 'stock' },
  { ticker: 'UPS', name: "UPS", address: '0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xf23250dac154d05bb671cb0d0ebef3c635c79ce2.png', decimals: 18, kind: 'stock' },
  { ticker: 'USAR', name: "USA Rare Earth", address: '0xd917B029C761D264c6A312BBbcDA868658eF86a6', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xd917b029c761d264c6a312bbbcda868658ef86a6.png', decimals: 18, kind: 'stock', chainlinkFeed: '0xA994d3684e8400A6c8078226925779FdeE682DD9' },
  { ticker: 'GLD', name: "SPDR Gold Shares", address: '0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e.png', decimals: 18, kind: 'etf' },
  { ticker: 'QQQ', name: "Invesco QQQ", address: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png', decimals: 18, kind: 'etf', chainlinkFeed: '0x80901d846d5D7B030F26B480776EE3b29374C2ae' },
  { ticker: 'SGOV', name: "iShares 0-3 Month Treasury Bond ETF", address: '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x92fd66527192e3e61d4ddd13322aa222de86f9b5.png', decimals: 18, kind: 'etf', chainlinkFeed: '0xa0DF4ee0fFf975306345875E3548Fcc519577A11' },
  { ticker: 'SLV', name: "iShares Silver Trust", address: '0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f.png', decimals: 18, kind: 'etf', chainlinkFeed: '0x209b73908e92Ae021826eD79609845451Ecba2ce' },
  { ticker: 'SPY', name: "SPDR S&P 500 ETF", address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png', decimals: 18, kind: 'etf', chainlinkFeed: '0x319724394D3A0e3669269846abE664Cd621f9f6A' },
  { ticker: 'USO', name: "United States Oil Fund", address: '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344.png', decimals: 18, kind: 'etf' },
  { ticker: 'XLK', name: "Technology Select Sector SPDR ETF", address: '0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43', logo: 'https://cdn.robinhood.com/ncw_assets/logos/0x15cd20759ce7f3285c29a319de2d1a2e098c6f43.png', decimals: 18, kind: 'etf' },
]

/** Non-stock quote assets LONG also lists on Robinhood Chain (not stocks; kept for completeness). */
export const ROBINHOOD_OTHER_NUMERAIRES = [
  { ticker: 'USDG', name: "Global Dollar", address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, kind: 'stable' }, // Robinhood native stablecoin
  { ticker: 'AI', name: "ArtificialINU", address: '0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18', decimals: 18, kind: 'token' }, // ArtificialINU memecoin (LONG "AI" rail)
  { ticker: 'NVDAx3L', name: "NVDA 3x Long", address: '0xF51fb54DE60f6e16252E852A5Ed0E60B8307606A', decimals: 18, kind: 'token' }, // NVDA 3x Long leveraged token; gated behind NEXT_PUBLIC_ROBINHOOD_NVDA3X_LAUNCH in LONG
] as const

export const STOCKS: ChainStocks[] = [
  { chainId: 4663, key: 'robinhood', name: 'Robinhood Chain', stocks: ROBINHOOD_STOCKS },
  { chainId: 0, key: 'solana', name: 'Solana', comingSoon: true, stocks: [] },
  { chainId: 1, key: 'ethereum', name: 'Ethereum', comingSoon: true, stocks: [] },
  { chainId: 42161, key: 'arbitrum', name: 'Arbitrum', comingSoon: true, stocks: [] },
  { chainId: 8453, key: 'base', name: 'Base', comingSoon: true, stocks: [] },
  { chainId: 143, key: 'monad', name: 'Monad', comingSoon: true, stocks: [] },
]

export default STOCKS

/** Stocks launchable on a chain (LONG-hidden `available:false` entries excluded). */
export function stocksFor(chainId: number): Stock[] {
  return (STOCKS.find((c) => c.chainId === chainId)?.stocks ?? []).filter((s) => s.available !== false)
}

/** Look a stock up by address or ticker. Returns undefined for anything not on the curated list. */
export function findStock(chainId: number, addressOrTicker: string): Stock | undefined {
  const a = (addressOrTicker ?? '').toLowerCase()
  return stocksFor(chainId).find((s) => s.address.toLowerCase() === a || s.ticker.toLowerCase() === a)
}
