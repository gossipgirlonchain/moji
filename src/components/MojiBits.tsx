import Link from "next/link";
import type { MojiRow } from "@/lib/supabase";
import { short, usd } from "@/lib/format";
import { dropsAllowlisted } from "@/config/drops";
import { chainById } from "@/config/chains";
import { MojiArt } from "./MojiArt";
import { mojiSub, mojiTitle } from "@/lib/meme-coin";

/**
 * The face of a token in a row or tile: its picture when it has one (MojiArt), else the bare emoji at `emoji` px,
 * exactly as rows looked before pictures existed. A meme with no picture yet shows its ticker on the sky gradient.
 */
export function Face({ m, size, radius = 14, emoji, className = "" }: { m: Pick<MojiRow, "display"> & { meme_url?: string | null }; size: number; radius?: number; emoji: number; className?: string }) {
  if (m.meme_url || m.display.startsWith("$")) return <MojiArt m={m} size={size} radius={radius} badge={false} className={className} />;
  return (
    <span className={`shrink-0 leading-none ${className}`} style={{ fontSize: emoji }}>
      {m.display}
    </span>
  );
}

/** Headline plus, for a meme, its `$PEPE / ETH` line under the title. */
export function MojiName({ m, className = "", subClassName = "" }: { m: Parameters<typeof mojiTitle>[0]; className?: string; subClassName?: string }) {
  const sub = mojiSub(m);
  return (
    <>
      <span className={className}>{mojiTitle(m)}</span>
      {sub && <span className={subClassName}>{sub}</span>}
    </>
  );
}

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
 * Tile: always a square. With a picture, the picture fills it and the name and numbers sit over the bottom;
 * without one, the emoji large over the name, as before. Same footprint either way, so grids stay even.
 */
export function MojiTile({ m, pop, compact, window }: { m: MojiRow; pop?: number; compact?: boolean; window?: VolWindow }) {
  const vol = window ? volumeFor(m, window) : Number(m.volume24_usd ?? 0);
  const fees = Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
  const pictured = Boolean(m.meme_url) || m.display.startsWith("$");
  const box = `press relative flex aspect-square flex-col items-center justify-center overflow-hidden text-center ${compact ? "clay-sm bg-sky-50" : "clay bg-white"} ${pop !== undefined ? `pop pop-${pop}` : ""}`;
  const numbers = (over: boolean) => (
    <>
      <span className={`heading ${over ? "text-white/90" : "text-ink-soft"} ${compact ? "text-[12px]" : "text-[13px]"}`}>{Number(m.market_cap_usd ?? 0) > 0 ? `mcap ${usd(m.market_cap_usd)}` : "just launched"}</span>
      {(window || compact) && vol > 0 && (
        <span className={`text-[11px] ${over ? "text-white/85" : "text-ink-soft"}`}>
          vol{window ? ` ${window}` : ""} {usd(vol)}
          {window && fees > 0 ? (
            <>
              {" · "}
              <span className={over ? "text-white" : "text-mint"}>{usd(fees)} fees</span>
            </>
          ) : null}
        </span>
      )}
    </>
  );
  if (!pictured) {
    return (
      <Link href={mojiHref(m)} className={`${box} gap-1 px-2`}>
        <DropsDot m={m} className="absolute right-3 top-3" />
        <AgentDot m={m} className="absolute left-3 top-3" />
        <span className="text-[44px] leading-none">{m.display}</span>
        <span className={`heading mt-2 max-w-full truncate text-ink ${compact ? "text-[13px]" : "text-[15px]"}`}>
          {m.display} / {m.stock_ticker}
        </span>
        {numbers(false)}
      </Link>
    );
  }
  return (
    <Link href={mojiHref(m)} className={box} title={m.description ?? undefined}>
      <MojiArt m={m} radius={0} badge={false} emojiSize={compact ? 56 : 72} />
      <DropsDot m={m} className="absolute right-2.5 top-2.5 drop-shadow" />
      <AgentDot m={m} className="absolute left-2.5 top-2.5 drop-shadow" />
      <span className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 text-white ${compact ? "px-2 pb-2.5 pt-8" : "px-3 pb-3 pt-10"}`} style={{ background: CAPTION_GRADIENT }}>
        <span className={`heading max-w-full truncate leading-tight ${compact ? "text-[13px]" : "text-[15px]"}`}>{mojiTitle(m)}</span>
        {mojiSub(m) && <span className="max-w-full truncate text-[11px] leading-tight text-white/85">{mojiSub(m)}</span>}
        {numbers(true)}
      </span>
    </Link>
  );
}

export function McapRow({ m, rank }: { m: MojiRow; rank: number }) {
  return (
    <Link href={mojiHref(m)} className="press clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
      <span className="heading w-5 text-[14px] text-ink-soft">{rank}</span>
      <Face m={m} size={44} radius={14} emoji={30} />
      <span className="heading flex-1 text-[15px] text-ink">
        {mojiTitle(m)} <DropsPill m={m} className="ml-1 align-middle" />
        {mojiSub(m) && <span className="block text-[12px] text-ink-soft">{mojiSub(m)}</span>}
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
      <Face m={m} size={44} radius={14} emoji={30} />
      <span className="heading flex-1 text-[15px] text-ink">
        {mojiTitle(m)} <DropsPill m={m} className="ml-1 align-middle" />
        {mojiSub(m) && <span className="block text-[12px] text-ink-soft">{mojiSub(m)}</span>}
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
      <Face m={m} size={48} radius={14} emoji={32} />
      <span className="flex-1">
        <span className="heading block text-[15px] text-ink">
          {mojiTitle(m)} <DropsPill m={m} className="ml-1 align-middle" />
        </span>
        {mojiSub(m) && <span className="heading block text-[12px] text-ink-soft">{mojiSub(m)}</span>}
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
