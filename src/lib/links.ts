import { chainById } from "@/config/chains";

/** Dexscreener pair pages key on the V4 poolId; a token address also resolves (redirects to top pair). */
export function dexscreenerUrl(chainId: number, token: string, poolId?: string | null): string {
  const c = chainById(chainId);
  return `https://dexscreener.com/${c?.dexscreenerSlug ?? "robinhood"}/${poolId ?? token}`;
}

export function matchaUrl(chainId: number, token: string): string {
  const c = chainById(chainId);
  const slug = c?.matchaSlug ?? "robinhood";
  return `https://matcha.xyz/tokens/${slug}/${token}`;
}

export function explorerAddress(chainId: number, addr: string): string {
  const c = chainById(chainId);
  const base = c?.viem?.blockExplorers?.default.url ?? "https://robinhoodchain.blockscout.com";
  return `${base}/address/${addr}`;
}

export function explorerTx(chainId: number, hash: string): string {
  const c = chainById(chainId);
  const base = c?.viem?.blockExplorers?.default.url ?? "https://robinhoodchain.blockscout.com";
  return `${base}/tx/${hash}`;
}

export function xUrl(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}
