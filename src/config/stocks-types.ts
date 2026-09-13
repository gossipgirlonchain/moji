export type Issuer = "robinhood" | "coinbase" | "doppler";

export type Stock = {
  ticker: string;
  name: string;
  address: `0x${string}`;
  logo: string;
  decimals: number;
  /** 'stock' or 'etf' */
  kind?: "stock" | "etf";
  /** Chainlink USD price feed proxy (Robinhood Chain only) */
  chainlinkFeed?: `0x${string}`;
  /** Hidden from the picker when false */
  available?: boolean;
  /** Who tokenized it */
  issuer?: Issuer;
  /** ERC-20 symbol on chain, e.g. AAPLc */
  symbolOnChain?: string;
  /** Where the USD price comes from. Default: Chainlink feed / Robinhood quote / Yahoo by ticker. */
  priceSource?: "dexscreener";
  /** Dexscreener chain slug, when priceSource is dexscreener */
  dexChain?: string;
};
