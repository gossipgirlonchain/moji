"use client";

import { useEffect, useMemo, useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { MojiListRow, volumeFor, type VolWindow } from "./MojiBits";
import { Pill } from "./ui";
import { CHAINS } from "@/config/chains";

const SORTS = [
  ["mcap", "market cap"],
  ["volume", "volume"],
  ["newest", "newest"],
  ["fees", "fees"],
] as const;
type Sort = (typeof SORTS)[number][0];

export function ExploreList({ initial }: { initial: MojiRow[] }) {
  const [rows, setRows] = useState(initial);
  const [sort, setSort] = useState<Sort>("mcap");
  const [window, setWindow] = useState<VolWindow>("24h");
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<number | null>(null);
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
    const byChain = chain ? rows.filter((m) => m.chain_id === chain) : rows;
    const base = t ? byChain.filter((m) => m.display.includes(t) || m.stock_ticker.toLowerCase().includes(t)) : byChain;
    return sort === "volume" ? [...base].sort((a, b) => volumeFor(b, window) - volumeFor(a, window)) : base;
  }, [rows, q, sort, window, chain]);

  return (
    <div className="flex flex-col gap-3">
      <input className="clay-input" placeholder="Search emoji or ticker" value={q} onChange={(e) => setQ(e.target.value)} />
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
      {chains.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setChain(null)} data-pressed={chain === null ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${chain === null ? "bg-sky-500 text-white" : "bg-white text-ink"}`}>
            all chains
          </button>
          {chains.map((c) => (
            <button key={c.chainId} type="button" onClick={() => setChain(c.chainId)} data-pressed={chain === c.chainId ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${chain === c.chainId ? "bg-sky-500 text-white" : "bg-white text-ink"}`} title={c.name}>
              {c.emoji} {c.short}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {list.length === 0 && <p className="py-6 text-center text-[14px] text-ink-soft">No mojis match.</p>}
        {list.map((m) => (
          <MojiListRow key={m.id} m={m} window={window} />
        ))}
      </div>
    </div>
  );
}
