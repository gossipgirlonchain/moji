"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { CHAINS } from "@/config/chains";
import { MojiTile, hasHolderRewards, volumeFor, type VolWindow } from "@/components/MojiBits";
import { Pill } from "@/components/ui";
import { ClaimsCounter } from "@/components/ClaimsCounter";

type Sort = "trending" | "new" | "rewards" | "mcap" | "fees";
const SORTS: [Sort, string][] = [
  ["trending", "trending"],
  ["new", "just launched"],
  ["rewards", "🪂 rewards"],
  ["mcap", "market cap"],
  ["fees", "fees"],
];
const PAGE = 18;

/** Desktop explore block on the home page: filters, chain pills, 6-wide grid. */
export function HomeExplore({ mojis, count }: { mojis: MojiRow[]; count: number }) {
  const [sort, setSort] = useState<Sort>("trending");
  const [window, setWindow] = useState<VolWindow>("24h");
  const [chain, setChain] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);

  const chains = useMemo(() => {
    const present = new Set(mojis.map((m) => m.chain_id));
    return CHAINS.filter((c) => present.has(c.chainId));
  }, [mojis]);

  const list = useMemo(() => {
    let rows = chain ? mojis.filter((m) => m.chain_id === chain) : mojis.slice();
    if (sort === "rewards") rows = rows.filter((m) => hasHolderRewards(m));
    const fees = (m: MojiRow) => Number(m.fees_total_usd ?? 0) || Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
    switch (sort) {
      case "trending":
        rows.sort((a, b) => volumeFor(b, window) - volumeFor(a, window) || Number(b.market_cap_usd ?? 0) - Number(a.market_cap_usd ?? 0));
        break;
      case "new":
        rows.sort((a, b) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime());
        break;
      case "fees":
        rows.sort((a, b) => fees(b) - fees(a));
        break;
      default:
        rows.sort((a, b) => Number(b.market_cap_usd ?? 0) - Number(a.market_cap_usd ?? 0));
    }
    return rows;
  }, [mojis, sort, window, chain]);

  return (
    <section className="clay pop pop-5 flex flex-col gap-4 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ClaimsCounter initial={count} />
          <span className="mx-1 text-ink-soft">·</span>
          {SORTS.map(([k, label]) => (
            <Pill key={k} active={sort === k} onClick={() => setSort(k)} className="px-3.5 py-1.5 text-[13px]">
              {label}
            </Pill>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {sort === "trending" &&
            (["1h", "6h", "24h", "all"] as VolWindow[]).map((w) => (
              <button key={w} type="button" onClick={() => setWindow(w)} data-pressed={window === w ? "true" : undefined} className={`press clay-pill heading px-3 py-1.5 text-[12px] ${window === w ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
                {w === "all" ? "all time" : w}
              </button>
            ))}
          {chains.length > 1 && (
            <>
              <span className="mx-1 text-ink-soft">·</span>
              <button type="button" onClick={() => setChain(null)} data-pressed={chain === null ? "true" : undefined} className={`press clay-pill heading px-3 py-1.5 text-[12px] ${chain === null ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
                all chains
              </button>
              {chains.map((c) => (
                <button key={c.chainId} type="button" onClick={() => setChain(c.chainId)} data-pressed={chain === c.chainId ? "true" : undefined} className={`press clay-pill heading px-3 py-1.5 text-[12px] ${chain === c.chainId ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`} title={c.name}>
                  {c.emoji} {c.short}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-ink-soft">No mojis match.</p>
      ) : (
        <div className="grid grid-cols-6 gap-3.5">
          {list.slice(0, shown).map((m) => (
            <MojiTile key={m.id} m={m} compact />
          ))}
        </div>
      )}
      <div className="flex justify-center gap-2">
        {list.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="press clay-pill heading bg-sky-50 px-5 py-2.5 text-[14px] text-ink">
            show {Math.min(PAGE, list.length - shown)} more
          </button>
        )}
        <Link href="/explore" className="press clay-pill heading bg-sky-50 px-5 py-2.5 text-[14px] text-ink">
          explore all
        </Link>
      </div>
    </section>
  );
}
