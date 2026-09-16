import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { usd } from "@/lib/format";
import { dropsAllowlisted } from "@/config/drops";
import { chainById } from "@/config/chains";

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

/** 🪂 pinned to a tile corner, no background. */
export function DropsDot({ m, className = "" }: { m: RewardsKey; className?: string }) {
  if (!hasHolderRewards(m)) return null;
  return (
    <span className={`block text-[22px] leading-[1] ${className}`} title="holder rewards" aria-label="holder rewards">
      🪂
    </span>
  );
}

/** Chain identifier: the chain's emoji, pinned to a tile corner or inline in a row. */
export function ChainDot({ chainId, className = "" }: { chainId: number; className?: string }) {
  const c = chainById(chainId);
  if (!c) return null;
  return (
    <span className={`block text-[16px] leading-[1] ${className}`} title={c.name} aria-label={c.name}>
      {c.emoji}
    </span>
  );
}

export function MojiTile({ m, pop, compact }: { m: MojiRow; pop?: number; compact?: boolean }) {
  return (
    <Link
      href={mojiHref(m)}
      className={`press relative flex flex-col items-center gap-1 text-center ${compact ? "clay-sm bg-sky-50 px-2 pb-4 pt-5" : "clay bg-white px-3 py-5"} ${pop !== undefined ? `pop pop-${pop}` : ""}`}
    >
      <ChainDot chainId={m.chain_id} className="absolute left-3 top-3 opacity-80" />
      <DropsDot m={m} className="absolute right-3 top-3" />
      <span className="text-[44px] leading-none">{m.display}</span>
      <span className="heading mt-2 max-w-full truncate text-[15px] text-ink">
        {m.display} / {m.stock_ticker}
      </span>
      <span className="heading text-[13px] text-ink-soft">{Number(m.market_cap_usd ?? 0) > 0 ? `mcap ${usd(m.market_cap_usd)}` : "just launched"}</span>
      {compact && Number(m.volume24_usd ?? 0) > 0 && <span className="text-[11px] text-ink-soft">vol {usd(m.volume24_usd)}</span>}
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
          {m.display} / {m.stock_ticker} <ChainDot chainId={m.chain_id} className="ml-1 inline-block align-middle" /> <DropsPill m={m} className="ml-1 align-middle" />
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
