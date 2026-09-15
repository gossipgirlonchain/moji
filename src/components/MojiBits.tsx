import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { usd } from "@/lib/format";
import { dropsAllowlisted } from "@/config/drops";

/** Same ticker can exist on several chains (AAPL on Robinhood, Ethereum, Arbitrum), so non-Robinhood links carry the chain id. */
export function mojiHref(m: Pick<MojiRow, "display" | "stock_ticker"> & { chain_id?: number }) {
  const base = `/m/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}`;
  return m.chain_id && m.chain_id !== 4663 ? `${base}/${m.chain_id}` : base;
}

type RewardsKey = Pick<MojiRow, "combo" | "stock_ticker" | "chain_id" | "drops_active" | "rewards_badge">;

/** This pair pays its holders: rewards are enabled for it, the creator turned the badge on, or it dropped in the last 14 days. */
export function hasHolderRewards(m: RewardsKey): boolean {
  return Boolean(m.rewards_badge) || Boolean(m.drops_active) || dropsAllowlisted(m);
}

/** 🪂 rewards pill, shown on list rows for a moji with holder rewards. */
export function DropsPill({ m, className = "" }: { m: RewardsKey; className?: string }) {
  if (!hasHolderRewards(m)) return null;
  return (
    <span className={`heading inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-white ${className}`} title="holder rewards">
      🪂 rewards
    </span>
  );
}

/** 🪂 in a mint circle, pinned to a tile corner. */
export function DropsDot({ m, className = "" }: { m: RewardsKey; className?: string }) {
  if (!hasHolderRewards(m)) return null;
  return (
    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-mint text-[20px] leading-none ${className}`} title="holder rewards" aria-label="holder rewards">
      🪂
    </span>
  );
}

export function MojiTile({ m, pop }: { m: MojiRow; pop?: number }) {
  return (
    <Link
      href={mojiHref(m)}
      className={`press clay relative flex flex-col items-center gap-1 bg-white px-3 py-5 text-center ${pop !== undefined ? `pop pop-${pop}` : ""}`}
    >
      <DropsDot m={m} className="absolute right-2.5 top-2.5" />
      <span className="text-[44px] leading-none">{m.display}</span>
      <span className="heading mt-2 text-[15px] text-ink">
        {m.display} / {m.stock_ticker}
      </span>
      <span className="heading text-[13px] text-ink-soft">{Number(m.market_cap_usd ?? 0) > 0 ? `mcap ${usd(m.market_cap_usd)}` : "just launched"}</span>
    </Link>
  );
}

export function McapRow({ m, rank }: { m: MojiRow; rank: number }) {
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
      <span className="heading w-5 text-[14px] text-ink-soft">{rank}</span>
      <span className="text-[30px] leading-none">{m.display}</span>
      <span className="heading flex-1 text-[15px] text-ink">
        {m.display} / {m.stock_ticker} <DropsPill m={m} className="ml-1 align-middle" />
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
        {m.display} / {m.stock_ticker} <DropsPill m={m} className="ml-1 align-middle" />
      </span>
      <span className="heading text-[17px] text-mint">{usd(total)}</span>
    </Link>
  );
}

export type VolWindow = "1h" | "6h" | "24h" | "all";
export function volumeFor(m: MojiRow, w: VolWindow): number {
  return Number((w === "1h" ? m.volume1h_usd : w === "6h" ? m.volume6h_usd : w === "all" ? m.volume_all_usd : m.volume24_usd) ?? 0);
}

export function MojiListRow({ m, window = "24h" }: { m: MojiRow; window?: VolWindow }) {
  const total = Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
  const vol = volumeFor(m, window);
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-white px-4 py-3">
      <span className="text-[30px] leading-none">{m.display}</span>
      <span className="flex-1">
        <span className="heading block text-[15px] text-ink">
          {m.display} / {m.stock_ticker} <DropsPill m={m} className="ml-1 align-middle" />
        </span>
        <span className="heading block text-[12px] text-ink-soft">
          {vol > 0 ? `vol ${window} ${usd(vol)} · ` : ""}fees <span className="text-mint">{usd(total)}</span>
        </span>
      </span>
      <span className="text-right">
        <span className="heading block text-[17px] text-ink">{usd(m.market_cap_usd)}</span>
        <span className="heading block text-[11px] uppercase tracking-[0.1em] text-ink-soft">mcap</span>
      </span>
    </Link>
  );
}
