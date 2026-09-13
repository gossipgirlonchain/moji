"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Launcher } from "@/lib/leaderboard";
import type { MojiRow } from "@/lib/supabase";
import { MojiListRow, mojiHref, volumeFor } from "./MojiBits";
import { Pill } from "./ui";
import { usd, short } from "@/lib/format";
import { xUrl } from "@/lib/links";

const LAUNCHER_SORTS = [
  ["earned", "earned"],
  ["mcap", "market cap"],
  ["volume", "volume 24h"],
  ["launches", "launches"],
] as const;
type LauncherSort = (typeof LAUNCHER_SORTS)[number][0];

const MOJI_SORTS = [
  ["mcap", "market cap"],
  ["volume", "volume 24h"],
  ["fees", "fees"],
] as const;
type MojiSort = (typeof MOJI_SORTS)[number][0];

function launcherValue(l: Launcher, s: LauncherSort): number {
  return s === "earned" ? l.earnedUsd : s === "mcap" ? l.mcapUsd : s === "volume" ? l.volume24Usd : l.launches;
}
function mojiValue(m: MojiRow, s: MojiSort): number {
  return s === "mcap" ? Number(m.market_cap_usd ?? 0) : s === "volume" ? volumeFor(m, "24h") : Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
}

export function Leaderboard({ launchers, mojis }: { launchers: Launcher[]; mojis: MojiRow[] }) {
  const [tab, setTab] = useState<"launchers" | "mojis">("launchers");
  const [lsort, setLsort] = useState<LauncherSort>("earned");
  const [msort, setMsort] = useState<MojiSort>("mcap");

  const topLaunchers = useMemo(() => [...launchers].sort((a, b) => launcherValue(b, lsort) - launcherValue(a, lsort)).slice(0, 50), [launchers, lsort]);
  const topMojis = useMemo(() => [...mojis].sort((a, b) => mojiValue(b, msort) - mojiValue(a, msort)).slice(0, 50), [mojis, msort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Pill active={tab === "launchers"} onClick={() => setTab("launchers")} className="flex-1">
          launchers
        </Pill>
        <Pill active={tab === "mojis"} onClick={() => setTab("mojis")} className="flex-1">
          mojis
        </Pill>
      </div>

      {tab === "launchers" ? (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {LAUNCHER_SORTS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLsort(k)}
                data-pressed={lsort === k ? "true" : undefined}
                className={`press clay-pill heading shrink-0 px-3.5 py-1.5 text-[13px] ${lsort === k ? "bg-sky-500 text-white" : "bg-white text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            {topLaunchers.length === 0 && <p className="py-6 text-center text-[14px] text-ink-soft">No launches yet.</p>}
            {topLaunchers.map((l, i) => (
              <LauncherRow key={l.key} l={l} rank={i + 1} sort={lsort} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {MOJI_SORTS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMsort(k)}
                data-pressed={msort === k ? "true" : undefined}
                className={`press clay-pill heading shrink-0 px-3.5 py-1.5 text-[13px] ${msort === k ? "bg-sky-500 text-white" : "bg-white text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            {topMojis.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="heading w-6 shrink-0 text-center text-[14px] text-ink-soft">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <MojiListRow m={m} window="24h" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];

function LauncherRow({ l, rank, sort }: { l: Launcher; rank: number; sort: LauncherSort }) {
  const name = l.handle ? `@${l.handle}` : short(l.address);
  const href = l.handle ? xUrl(l.handle) : undefined;
  const value = sort === "launches" ? `${l.launches}` : usd(launcherValue(l, sort));
  const label = sort === "earned" ? "earned" : sort === "mcap" ? "mcap" : sort === "volume" ? "vol 24h" : "launched";
  return (
    <div className={`clay-sm flex items-center gap-3 px-4 py-3 ${rank <= 3 ? "bg-sky-50" : "bg-white"}`}>
      <span className="heading w-6 shrink-0 text-center text-[16px] text-ink-soft">{MEDAL[rank - 1] ?? rank}</span>
      <Avatar handle={l.handle} address={l.address} />
      <span className="min-w-0 flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="heading block truncate text-[15px] text-ink">
            {name}
          </a>
        ) : (
          <span className="heading block truncate text-[15px] text-ink">{name}</span>
        )}
        <span className="heading block truncate text-[12px] text-ink-soft">
          {l.launches} {l.launches === 1 ? "moji" : "mojis"}
          {l.best && (
            <>
              {" · "}
              <Link href={mojiHref(l.best)} className="text-sky-600">
                {l.best.display} / {l.best.stock_ticker}
              </Link>
            </>
          )}
        </span>
      </span>
      <span className="text-right">
        <span className={`heading block text-[17px] ${sort === "earned" ? "text-mint" : "text-ink"}`}>{value}</span>
        <span className="heading block text-[11px] uppercase tracking-[0.1em] text-ink-soft">{label}</span>
      </span>
    </div>
  );
}

function Avatar({ handle, address }: { handle: string | null; address: string | null }) {
  const [broken, setBroken] = useState(false);
  const initial = (handle ?? address ?? "?").replace(/^0x/, "").slice(0, 1).toUpperCase();
  if (!handle || broken) {
    return (
      <span className="clay-sm flex h-10 w-10 shrink-0 items-center justify-center bg-sky-100" style={{ borderRadius: 999 }}>
        <span className="heading text-[15px] text-sky-600">{initial}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://unavatar.io/x/${encodeURIComponent(handle)}?fallback=false`}
      alt=""
      width={40}
      height={40}
      onError={() => setBroken(true)}
      className="clay-sm h-10 w-10 shrink-0 bg-sky-100 object-cover"
      style={{ borderRadius: 999 }}
    />
  );
}
