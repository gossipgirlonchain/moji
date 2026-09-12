export type Issuer = "robinhood" | "doppler";

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
  /** ERC-20 symbol on chain, e.g. AAPLon, AAPLx, aAAPL */
  symbolOnChain?: string;
};
