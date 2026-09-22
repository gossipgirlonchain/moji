import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { usd } from "@/lib/format";
import { chainById } from "@/config/chains";
import { Label } from "@/components/ui";
import { CAPTION_GRADIENT, DropsDot, creatorLabel, mojiHref } from "@/components/MojiBits";
import { MojiArt } from "@/components/MojiArt";
import { mojiSub, mojiTitle } from "@/lib/meme-coin";

/** Desktop row: the five biggest mojis as big picture cards, mcap and creator over a gradient at the bottom. */
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
          const holders = Number(m.holders_count ?? 0);
          return (
            <Link key={m.id} href={mojiHref(m)} className={`press clay pop pop-${Math.min(5, i + 1)} relative block min-h-[160px] overflow-hidden bg-white`} title={m.description ?? undefined}>
              <MojiArt m={m} radius={0} badge={false} emojiSize={96} eager />
              <span className="heading absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[12px] leading-none text-ink shadow-sm">#{i + 1}</span>
              <DropsDot m={m} className="absolute right-3 top-3 drop-shadow" />
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-4 pb-3.5 pt-12 text-left text-white" style={{ background: CAPTION_GRADIENT }}>
                <span className="heading truncate text-[17px] leading-tight">{mojiTitle(m)}</span>
                {mojiSub(m) && <span className="truncate text-[12px] leading-tight text-white/85">{mojiSub(m)}</span>}
                <span className="num text-[24px] leading-tight">{Number(m.market_cap_usd ?? 0) > 0 ? usd(m.market_cap_usd) : "just launched"}</span>
                <span className="truncate text-[12px] leading-tight text-white/85">
                  {creatorLabel(m)}
                  {chain ? ` · ${chain.short}` : ""}
                  {holders > 0 ? ` · ${holders.toLocaleString()} holders` : ""}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
