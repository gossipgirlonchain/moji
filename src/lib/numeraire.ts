import { getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { chainById, type MojiChain } from "@/config/chains";
import { stocksFor, type Stock } from "@/config/stocks";
import { tokensFor } from "@/config/tokens";

/**
 * What a moji can pair against on a chain. Two tabs on the launch page:
 *  - STOCK: tokenized stocks (Robinhood Chain: the LONG list; Base: Coinbase Tokenized Stocks)
 *  - TOKEN: the chain's WETH from Doppler's address map (as in the docs' examples) plus curated liquid tokens
 * Doppler's Airlock takes any ERC-20 as numeraire; the launch path is identical either way.
 */
export function wethNumeraire(chain: MojiChain): Stock | null {
  if (!chain.viem) return null;
  const weth = (getAddresses(chain.chainId) as { weth?: `0x${string}` }).weth;
  if (!weth) return null;
  const sym = chain.gasSymbol;
  return { ticker: sym, name: chain.viem.nativeCurrency.name, address: weth, logo: "", decimals: 18, kind: "stock", issuer: "doppler", symbolOnChain: `W${sym}` };
}

export function stockNumeraires(chain: MojiChain): Stock[] {
  return stocksFor(chain.chainId);
}

export function tokenNumeraires(chain: MojiChain): Stock[] {
  const w = wethNumeraire(chain);
  return [...(w ? [w] : []), ...tokensFor(chain.chainId)];
}

/** Every valid numeraire for a chain. */
export function numerairesFor(chain: MojiChain): Stock[] {
  return [...stockNumeraires(chain), ...tokenNumeraires(chain)];
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
