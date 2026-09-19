import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { usd } from "@/lib/format";
import { chainById } from "@/config/chains";
import { Label } from "@/components/ui";
import { DropsDot, mojiHref } from "@/components/MojiBits";

/** Desktop row: the five biggest mojis as wide cards. */
export function TopMojis({ mojis }: { mojis: MojiRow[] }) {
  const top = mojis.slice(0, 5);
  if (top.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <Label>Top mojis</Label>
        <span className="heading text-[13px] text-sky-600">by market cap</span>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {top.map((m, i) => {
          const chain = chainById(m.chain_id);
          return (
            <Link key={m.id} href={mojiHref(m)} className={`press clay pop pop-${Math.min(5, i + 1)} relative flex items-center gap-4 bg-white px-5 py-4`}>
              <DropsDot m={m} className="absolute right-3 top-3" />
              <span className="text-[52px] leading-none">{m.display}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="heading truncate text-[17px] text-ink">
                  {m.display} / {m.stock_ticker}
                </span>
                <span className="num text-[21px] text-ink">{Number(m.market_cap_usd ?? 0) > 0 ? usd(m.market_cap_usd) : "just launched"}</span>
                <span className="truncate text-[12px] text-ink-soft">
                  {chain ? chain.short : ""}
                  {Number(m.holders_count ?? 0) > 0 ? ` · ${m.holders_count} holders` : ""}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
