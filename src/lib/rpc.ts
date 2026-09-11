import { createPublicClient, fallback, http, type Chain, type PublicClient } from "viem";
import { robinhoodChain } from "@/config/chains";

/**
 * One resilient public client per chain. Robinhood's public RPC rate-limits bursts and rejects
 * requests without a User-Agent, so reads go through a fallback list with retries.
 */
const ROBINHOOD_RPCS = [
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL,
  "https://rpc.mainnet.chain.robinhood.com",
  "https://robinhood-rpc.publicnode.com",
  "https://robinhood.api.pocket.network",
].filter((u): u is string => Boolean(u));

const UA = { headers: { "user-agent": "moji.wtf" } };

/** Extra public RPCs per chain, tried after the viem default. */
const EXTRA_RPCS: Record<number, string[]> = {
  1: ["https://eth.llamarpc.com", "https://ethereum-rpc.publicnode.com"],
  42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
  8453: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  143: ["https://rpc.monad.xyz", "https://monad-rpc.publicnode.com"],
};

export function transportFor(chain: Chain) {
  const opts = { fetchOptions: UA, retryCount: 2, retryDelay: 250, timeout: 12_000 } as const;
  if (chain.id === robinhoodChain.id) {
    return fallback(ROBINHOOD_RPCS.map((u) => http(u, opts)), { retryCount: 1 });
  }
  const urls = [...chain.rpcUrls.default.http, ...(EXTRA_RPCS[chain.id] ?? [])];
  return fallback([...new Set(urls)].map((u) => http(u, opts)), { retryCount: 1 });
}

const cache = new Map<number, PublicClient>();
export function publicClientFor(chain: Chain): PublicClient {
  let pc = cache.get(chain.id);
  if (!pc) {
    pc = createPublicClient({ chain, transport: transportFor(chain), batch: { multicall: true } }) as PublicClient;
    cache.set(chain.id, pc);
  }
  return pc;
}
