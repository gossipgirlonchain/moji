import { isMemeRow } from "./memecoin";

type Linkable = { display: string; stock_ticker: string; chain_id?: number; kind?: string | null; symbol?: string | null };

/**
 * Page for a moji or a meme. Same ticker can exist on several chains (AAPL on Robinhood, Ethereum, Arbitrum),
 * so non-Robinhood links carry the chain id. Memes live under /meme/<TICKER>/<pair>.
 */
export function mojiHref(m: Linkable): string {
  const chain = m.chain_id && m.chain_id !== 4663 ? `/${m.chain_id}` : "";
  if (isMemeRow(m) && m.symbol) return `/meme/${encodeURIComponent(m.symbol)}/${encodeURIComponent(m.stock_ticker)}${chain}`;
  return `/m/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}${chain}`;
}
