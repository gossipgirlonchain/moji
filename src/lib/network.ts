/** Claims are scoped by network so testnet launches never burn a mainnet combo. */
export type Network = "mainnet" | "testnet";
export const NETWORK: Network = (process.env.NEXT_PUBLIC_NETWORK as Network) === "testnet" ? "testnet" : "mainnet";

/** Canonical public origin, used for token metadata URIs and share links. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://moji.wtf").replace(/\/$/, "");
