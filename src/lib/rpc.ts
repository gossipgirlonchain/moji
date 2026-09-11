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

export function transportFor(chain: Chain) {
  if (chain.id === robinhoodChain.id) {
    return fallback(
      ROBINHOOD_RPCS.map((u) => http(u, { fetchOptions: UA, retryCount: 2, retryDelay: 250, timeout: 12_000 })),
      { retryCount: 1 },
    );
  }
  return http(undefined, { retryCount: 2, retryDelay: 250 });
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
