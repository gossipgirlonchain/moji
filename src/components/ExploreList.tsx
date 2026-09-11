"use client";

import { useEffect, useMemo, useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { MojiListRow } from "./MojiBits";
import { Pill } from "./ui";

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
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/mojis?sort=${sort}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { mojis: MojiRow[] }) => alive && setRows(j.mojis))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sort]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((m) => m.display.includes(t) || m.stock_ticker.toLowerCase().includes(t));
  }, [rows, q]);

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
      <div className="flex flex-col gap-2.5">
        {list.length === 0 && <p className="py-6 text-center text-[14px] text-ink-soft">No mojis match.</p>}
        {list.map((m) => (
          <MojiListRow key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
