import { getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { chainById, type MojiChain } from "@/config/chains";
import { stocksFor, type Stock } from "@/config/stocks";

/**
 * What a moji pairs against on a given chain.
 *  - Robinhood Chain: a tokenized stock from the LONG list (Doppler's own app).
 *  - Every other chain: the chain's WETH from Doppler's address map, exactly as the docs' launch examples do
 *    (`numeraire: addresses.weth`). Doppler's indexer is built around ETH-quoted pools.
 */
export function wethNumeraire(chain: MojiChain): Stock | null {
  if (chain.numeraire !== "weth" || !chain.viem) return null;
  const weth = (getAddresses(chain.chainId) as { weth?: `0x${string}` }).weth;
  if (!weth) return null;
  const sym = chain.gasSymbol; // ETH, or MON on Monad
  return { ticker: sym, name: chain.viem.nativeCurrency.name, address: weth, logo: "", decimals: 18, kind: "stock", issuer: "doppler", symbolOnChain: `W${sym}` };
}

/** Every valid numeraire for a chain: the stock list, or the single WETH entry. */
export function numerairesFor(chain: MojiChain): Stock[] {
  if (chain.numeraire === "weth") {
    const w = wethNumeraire(chain);
    return w ? [w] : [];
  }
  return stocksFor(chain.chainId);
}

/** Resolve a numeraire by address or ticker on a chain. */
export function findNumeraire(chainId: number, addressOrTicker: string): Stock | undefined {
  const chain = chainById(chainId);
  if (!chain) return undefined;
  const a = (addressOrTicker ?? "").toLowerCase();
  return numerairesFor(chain).find((s) => s.address.toLowerCase() === a || s.ticker.toLowerCase() === a);
}

/** A chain is launchable when it is live and has at least one numeraire. */
export function chainLaunchable(chain: MojiChain): boolean {
  return chain.live && Boolean(chain.viem) && numerairesFor(chain).length > 0;
}
