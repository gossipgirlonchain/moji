"use client";

import { useEffect, useMemo, useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { MojiTile, volumeFor, type VolWindow } from "./MojiBits";
import { Pill } from "./ui";
import { CHAINS } from "@/config/chains";
import { ChainSelect } from "./ChainSelect";
import { isMeme } from "@/lib/meme-coin";

const SORTS = [
  ["mcap", "market cap"],
  ["volume", "volume"],
  ["newest", "newest"],
  ["fees", "fees"],
] as const;
type Sort = (typeof SORTS)[number][0];

export function ExploreList({ initial, initialQ = "" }: { initial: MojiRow[]; initialQ?: string }) {
  const [rows, setRows] = useState(initial);
  const [sort, setSort] = useState<Sort>("mcap");
  const [window, setWindow] = useState<VolWindow>("24h");
  const [q, setQ] = useState(initialQ);
  const [chain, setChain] = useState<number | null>(null);
  const [kind, setKind] = useState<"all" | "memes" | "mojis">("all");
  const chains = useMemo(() => {
    const present = new Set(rows.map((m) => m.chain_id));
    return CHAINS.filter((c) => present.has(c.chainId));
  }, [rows]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/mojis?sort=${sort}&window=${window}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { mojis: MojiRow[] }) => alive && setRows(j.mojis))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sort, window]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const byKind = kind === "all" ? rows : rows.filter((m) => (kind === "memes") === isMeme(m));
    const byChain = chain ? byKind.filter((m) => m.chain_id === chain) : byKind;
    const base = t ? byChain.filter((m) => m.display.toLowerCase().includes(t) || m.stock_ticker.toLowerCase().includes(t) || (m.name ?? "").toLowerCase().includes(t)) : byChain;
    return sort === "volume" ? [...base].sort((a, b) => volumeFor(b, window) - volumeFor(a, window)) : base;
  }, [rows, q, sort, window, chain, kind]);

  return (
    // Phone: stacked controls and a 2-wide grid. Desktop: the controls share one row and the pictures run 5 wide.
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <input className="clay-input lg:max-w-[300px]" placeholder="Search emoji or ticker" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2">
        {SORTS.map(([k, label]) => (
          <Pill key={k} active={sort === k} onClick={() => setSort(k)}>
            {label}
          </Pill>
        ))}
      </div>
      <div className="flex gap-2">
        {(["1h", "6h", "24h", "all"] as VolWindow[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWindow(w)}
            data-pressed={window === w ? "true" : undefined}
            className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${window === w ? "bg-sky-500 text-white" : "bg-white text-ink"}`}
          >
            {w === "all" ? "all time" : w}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {(["all", "memes", "mojis"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} data-pressed={kind === k ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${kind === k ? "bg-sky-500 text-white" : "bg-white text-ink"}`}>
            {k === "all" ? "all" : k === "memes" ? "🐸 memes" : "🍏 mojis"}
          </button>
        ))}
      </div>
      <ChainSelect chains={chains} value={chain} onChange={setChain} className="self-start lg:self-auto" />
      {list.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-ink-soft lg:basis-full">No mojis match.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:basis-full lg:grid-cols-5 lg:gap-4">
          {list.map((m) => (
            <MojiTile key={m.id} m={m} window={window} />
          ))}
        </div>
      )}
    </div>
  );
}
