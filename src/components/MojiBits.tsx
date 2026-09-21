import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { short, usd } from "@/lib/format";
import { dropsAllowlisted } from "@/config/drops";
import { chainById } from "@/config/chains";
import { MojiArt } from "./MojiArt";

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

/** Launched by an autonomous agent (recorded through the wallet path with `agent: true`). */
export function isAgentLaunch(m: Pick<MojiRow, "creator_kind">): boolean {
  return m.creator_kind === "agent";
}

/** 🤖 pinned to a tile corner, no background. */
export function AgentDot({ m, className = "" }: { m: Pick<MojiRow, "creator_kind">; className?: string }) {
  if (!isAgentLaunch(m)) return null;
  return (
    <span className={`block text-[22px] leading-[1] ${className}`} title="launched by an agent" aria-label="launched by an agent">
      🤖
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

/** Who launched it, for captions: @handle, or the (🤖-prefixed) short address, or "anon". */
export function creatorLabel(m: Pick<MojiRow, "creator_handle" | "creator_address" | "creator_kind">): string {
  if (m.creator_handle) return `@${m.creator_handle}`;
  if (m.creator_address) return `${m.creator_kind === "agent" ? "🤖 " : ""}${short(m.creator_address)}`;
  return "anon";
}

/** Soft ink gradient for captions laid over a picture. */
export const CAPTION_GRADIENT = "linear-gradient(to top, rgba(18, 64, 92, 0.86) 0%, rgba(18, 64, 92, 0.55) 55%, rgba(18, 64, 92, 0) 100%)";

/**
 * Desktop picture tile: the art edge to edge, name and mcap over a gradient at the bottom,
 * volume, fees and holders revealed on hover.
 */
export function MojiPicTile({ m, window = "24h", eager }: { m: MojiRow; window?: VolWindow; eager?: boolean }) {
  const vol = volumeFor(m, window);
  const fees = Number(m.fees_total_usd ?? 0) || Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
  const holders = Number(m.holders_count ?? 0);
  const mcap = Number(m.market_cap_usd ?? 0);
  return (
    <Link href={mojiHref(m)} className="press group clay-sm relative block overflow-hidden bg-sky-50" title={m.description ?? undefined}>
      <MojiArt m={m} radius={0} badge={false} emojiSize={72} eager={eager} />
      <DropsDot m={m} className="absolute right-2.5 top-2.5 drop-shadow" />
      <AgentDot m={m} className="absolute left-2.5 top-2.5 drop-shadow" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-3 pb-2.5 pt-10 text-left text-white" style={{ background: CAPTION_GRADIENT }}>
        <span className="heading truncate text-[15px] leading-tight">
          {m.display} / {m.stock_ticker}
        </span>
        <span className="heading text-[13px] leading-tight text-white/90">{mcap > 0 ? `mcap ${usd(mcap)}` : "just launched"}</span>
        <span className="truncate text-[11px] leading-tight text-white/85 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
          vol {window === "all" ? "all time" : window} {usd(vol)} · fees {usd(fees)} · {holders.toLocaleString()} holder{holders === 1 ? "" : "s"}
        </span>
      </span>
    </Link>
  );
}

/** Picture-first tile: the meme (or the emoji on sky) as a square, name and numbers under it. */
export function MojiTile({ m, pop, compact, window }: { m: MojiRow; pop?: number; compact?: boolean; window?: VolWindow }) {
  const vol = window ? volumeFor(m, window) : Number(m.volume24_usd ?? 0);
  const fees = Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
  return (
    <Link
      href={mojiHref(m)}
      className={`press relative flex flex-col overflow-hidden text-center ${compact ? "clay-sm bg-sky-50" : "clay bg-white"} ${pop !== undefined ? `pop pop-${pop}` : ""}`}
    >
      <MojiArt m={m} radius={0} emojiSize={compact ? 56 : 72} />
      <DropsDot m={m} className="absolute right-2.5 top-2.5 drop-shadow" />
      <AgentDot m={m} className="absolute left-2.5 top-2.5 drop-shadow" />
      <span className={`flex flex-col items-center gap-0.5 ${compact ? "px-2 pb-3 pt-2" : "px-3 pb-3.5 pt-2.5"}`}>
        <span className={`heading max-w-full truncate text-ink ${compact ? "text-[13px]" : "text-[15px]"}`}>
          {m.display} / {m.stock_ticker}
        </span>
        <span className={`heading text-ink-soft ${compact ? "text-[12px]" : "text-[13px]"}`}>{Number(m.market_cap_usd ?? 0) > 0 ? `mcap ${usd(m.market_cap_usd)}` : "just launched"}</span>
        {(window || compact) && vol > 0 && (
          <span className="text-[11px] text-ink-soft">
            vol{window ? ` ${window}` : ""} {usd(vol)}
            {window && fees > 0 ? (
              <>
                {" · "}
                <span className="text-mint">{usd(fees)} fees</span>
              </>
            ) : null}
          </span>
        )}
      </span>
    </Link>
  );
}

export function McapRow({ m, rank }: { m: MojiRow; rank: number }) {
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
      <span className="heading w-5 text-[14px] text-ink-soft">{rank}</span>
      <MojiArt m={m} size={44} radius={14} />
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
      <MojiArt m={m} size={44} radius={14} />
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
      <MojiArt m={m} size={48} radius={14} />
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
