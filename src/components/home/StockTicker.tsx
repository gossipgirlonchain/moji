import Image from "next/image";
import type { MojiRow } from "@/lib/supabase";
import { findNumeraire } from "@/lib/numeraire";
import { stockPriceServer } from "@/lib/market";
import { usd } from "@/lib/format";

/**
 * Desktop strip of the stocks with the most moji market cap behind them, with a live price each.
 * Server component; prices are fetched in parallel and cached by the page's revalidate.
 */
export async function StockTicker({ mojis, limit = 8 }: { mojis: MojiRow[]; limit?: number }) {
  const byStock = new Map<string, { m: MojiRow; mcap: number; count: number }>();
  for (const m of mojis) {
    const k = `${m.chain_id}:${m.stock_address.toLowerCase()}`;
    const cur = byStock.get(k);
    const mc = Number(m.market_cap_usd ?? 0);
    if (cur) {
      cur.mcap += mc;
      cur.count++;
    } else byStock.set(k, { m, mcap: mc, count: 1 });
  }
  const top = [...byStock.values()].sort((a, b) => b.mcap - a.mcap).slice(0, limit);
  const prices = await Promise.all(top.map((t) => stockPriceServer(t.m.chain_id, t.m.stock_address, t.m.stock_ticker).catch(() => 0)));
  if (top.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5 overflow-x-auto scroll-x">
      {top.map((t, i) => {
        const s = findNumeraire(t.m.chain_id, t.m.stock_address);
        return (
          <span key={`${t.m.chain_id}:${t.m.stock_address}`} className="clay-pill num flex shrink-0 items-center gap-2 bg-white px-3.5 py-1.5 text-[13px] text-ink">
            {s?.logo ? <Image src={s.logo} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-md" /> : null}
            {t.m.stock_ticker}
            {prices[i] > 0 && <span className="text-ink-soft">{usd(prices[i], { compact: false })}</span>}
            <span className="text-[11px] text-ink-soft">{t.count} moji{t.count === 1 ? "" : "s"}</span>
          </span>
        );
      })}
    </div>
  );
}
