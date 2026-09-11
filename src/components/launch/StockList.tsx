"use client";

import { useMemo, useState } from "react";
import type { Stock } from "@/config/stocks";

export function StockList({ stocks, value, onChange }: { stocks: Stock[]; value?: Stock; onChange: (s: Stock) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stocks;
    return stocks.filter((s) => s.ticker.toLowerCase().includes(t) || s.name.toLowerCase().includes(t));
  }, [q, stocks]);

  return (
    <div>
      <input
        className="clay-input mb-3"
        placeholder="Search ticker or company"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        inputMode="search"
      />
      <div className="scroll-y flex max-h-[300px] flex-col gap-1.5 bg-sky-50 p-2" style={{ borderRadius: "var(--r-sm)", boxShadow: "var(--clay-press)" }}>
        {list.length === 0 && <p className="p-3 text-center text-[14px] text-ink-soft">No stock matches.</p>}
        {list.map((s) => {
          const active = value?.address === s.address;
          return (
            <button
              key={s.address}
              type="button"
              onClick={() => onChange(s)}
              data-pressed={active ? "true" : undefined}
              className={`press flex items-center gap-3 px-3 py-2.5 text-left ${active ? "clay-sm bg-sky-500 text-white" : "bg-transparent text-ink"}`}
              style={{ borderRadius: "var(--r-sm)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logo} alt="" width={32} height={32} className="h-8 w-8 shrink-0 bg-white object-cover" style={{ borderRadius: 999 }} loading="lazy" />
              <span className="heading w-[64px] shrink-0 text-[16px]">{s.ticker}</span>
              <span className={`truncate text-[13px] ${active ? "text-white/85" : "text-ink-soft"}`}>{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
