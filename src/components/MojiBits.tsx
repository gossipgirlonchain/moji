import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { usd } from "@/lib/format";

export function mojiHref(m: Pick<MojiRow, "display">) {
  return `/m/${encodeURIComponent(m.display)}`;
}

export function MojiTile({ m, pop }: { m: MojiRow; pop?: number }) {
  return (
    <Link
      href={mojiHref(m)}
      className={`press clay flex flex-col items-center gap-1 bg-white px-3 py-5 text-center ${pop !== undefined ? `pop pop-${pop}` : ""}`}
    >
      <span className="text-[44px] leading-none">{m.display}</span>
      <span className="heading mt-2 text-[15px] text-ink">
        {m.display} / {m.stock_ticker}
      </span>
      <span className="heading text-[13px] text-ink-soft">mcap {usd(m.market_cap_usd)}</span>
    </Link>
  );
}

export function McapRow({ m, rank }: { m: MojiRow; rank: number }) {
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
      <span className="heading w-5 text-[14px] text-ink-soft">{rank}</span>
      <span className="text-[30px] leading-none">{m.display}</span>
      <span className="heading flex-1 text-[15px] text-ink">
        {m.display} / {m.stock_ticker}
      </span>
      <span className="heading text-[17px] text-ink">{usd(m.market_cap_usd)}</span>
    </Link>
  );
}

export function EarnerRow({ m, rank }: { m: MojiRow & { earnedUsd?: number }; rank: number }) {
  const total = m.earnedUsd ?? Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
      <span className="heading w-5 text-[14px] text-ink-soft">{rank}</span>
      <span className="text-[30px] leading-none">{m.display}</span>
      <span className="heading flex-1 text-[15px] text-ink">
        {m.display} / {m.stock_ticker}
      </span>
      <span className="heading text-[17px] text-mint">{usd(total)}</span>
    </Link>
  );
}

export function MojiListRow({ m }: { m: MojiRow }) {
  const total = Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-white px-4 py-3">
      <span className="text-[30px] leading-none">{m.display}</span>
      <span className="flex-1">
        <span className="heading block text-[15px] text-ink">
          {m.display} / {m.stock_ticker}
        </span>
        <span className="heading block text-[12px] text-ink-soft">mcap {usd(m.market_cap_usd)}</span>
      </span>
      <span className="text-right">
        <span className="heading block text-[15px] text-mint">{usd(total)}</span>
        <span className="heading block text-[11px] uppercase tracking-[0.1em] text-ink-soft">fees</span>
      </span>
    </Link>
  );
}
