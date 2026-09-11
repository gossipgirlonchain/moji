"use client";

import { useMemo, useState } from "react";
import type { Stock } from "@/config/stocks";
import { StockLogo } from "@/components/StockLogo";

export function StockList({ stocks, value, onChange }: { stocks: Stock[]; value?: Stock; onChange: (s: Stock) => void }) {
  const [q, setQ] = useState("");
  const LIMIT = 80;
  const { list, hidden } = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = t ? stocks.filter((s) => s.ticker.toLowerCase().includes(t) || s.name.toLowerCase().includes(t) || (s.symbolOnChain ?? "").toLowerCase().includes(t)) : stocks;
    // exact ticker hits first, then the rest in list order
    const sorted = t ? [...all].sort((a, b) => Number(b.ticker.toLowerCase() === t) - Number(a.ticker.toLowerCase() === t)) : all;
    return { list: sorted.slice(0, LIMIT), hidden: Math.max(0, sorted.length - LIMIT) };
  }, [q, stocks]);

  return (
    <div>
      <input
        className="clay-input mb-3"
        placeholder={`Search ${stocks.length} stocks`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        inputMode="search"
      />
      <div className="scroll-y flex max-h-[300px] flex-col gap-1.5 bg-sky-50 p-2" style={{ borderRadius: "var(--r-sm)", boxShadow: "var(--clay-press)" }}>
        {list.length === 0 && <p className="p-3 text-center text-[14px] text-ink-soft">No stock matches.</p>}
        {hidden > 0 && <p className="px-3 pt-1 text-center text-[11px] text-ink-soft">showing {LIMIT}, {hidden} more · keep typing</p>}
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
              <StockLogo ticker={s.ticker} logo={s.logo} size={34} />
              <span className="heading w-[64px] shrink-0 text-[16px]">{s.ticker}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] ${active ? "text-white/85" : "text-ink-soft"}`}>{s.name}</span>
                {s.issuer && s.issuer !== "robinhood" && (
                  <span className={`block text-[10px] uppercase tracking-[0.1em] ${active ? "text-white/70" : "text-sky-600"}`}>{s.issuer === "backed" ? "xStocks" : s.issuer}{s.symbolOnChain ? ` · ${s.symbolOnChain}` : ""}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
