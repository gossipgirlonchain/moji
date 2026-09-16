import type { MojiRow } from "@/lib/supabase";
import { findNumeraire } from "@/lib/numeraire";
import { stockStatsServer } from "@/lib/market";
import { StockCards, type StockGroup } from "./StockCards";

const STATS_FOR = 30;

/**
 * Desktop "by stock" view: one card per company, the mojis paired with it competing for share.
 * Server component; groups every moji by ticker across chains and fetches the stock's real-world
 * numbers for the biggest groups in parallel (cached by the page's revalidate).
 */
export async function StockEcosystem({ mojis }: { mojis: MojiRow[] }) {
  const byTicker = new Map<string, StockGroup>();
  for (const m of mojis) {
    const key = m.stock_ticker.toUpperCase();
    let g = byTicker.get(key);
    if (!g) {
      const s = findNumeraire(m.chain_id, m.stock_address);
      g = { key, ticker: m.stock_ticker, name: s?.name || m.stock_ticker, logo: s?.logo || "", price: 0, changePct: 0, stockMcap: 0, stockVol: 0, mojis: [] };
      byTicker.set(key, g);
    }
    g.mojis.push(m);
  }
  const groups = [...byTicker.values()];
  for (const g of groups) g.mojis.sort((a, b) => Number(b.market_cap_usd ?? 0) - Number(a.market_cap_usd ?? 0));
  const mojiMcap = (g: StockGroup) => g.mojis.reduce((s, m) => s + Number(m.market_cap_usd ?? 0), 0);
  groups.sort((a, b) => mojiMcap(b) - mojiMcap(a));
  const head = groups.slice(0, STATS_FOR);
  const stats = await Promise.all(head.map((g) => stockStatsServer(g.mojis[0].chain_id, g.mojis[0].stock_address, g.ticker).catch(() => null)));
  head.forEach((g, i) => {
    const s = stats[i];
    if (!s) return;
    g.price = s.price;
    g.changePct = s.changePct;
    g.stockMcap = s.marketCapUsd;
    g.stockVol = s.volumeUsd;
  });
  if (groups.length === 0) return null;
  return <StockCards groups={groups} />;
}
