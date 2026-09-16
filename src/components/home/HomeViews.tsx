"use client";

import { useState, type ReactNode } from "react";

/** Desktop home tab switch: "by stock" (default) or the flat "all mojis" grid. Both are server-rendered. */
export function HomeViews({ stocks, mojis }: { stocks: ReactNode; mojis: ReactNode }) {
  const [view, setView] = useState<"stocks" | "mojis">("stocks");
  const tab = (on: boolean) => `press clay-pill heading px-5 py-2 text-[14px] ${on ? "bg-sky-500 text-white" : "bg-white text-ink"}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setView("stocks")} data-pressed={view === "stocks" ? "true" : undefined} className={tab(view === "stocks")}>
          by stock
        </button>
        <button type="button" onClick={() => setView("mojis")} data-pressed={view === "mojis" ? "true" : undefined} className={tab(view === "mojis")}>
          all mojis
        </button>
      </div>
      <div className={view === "stocks" ? "" : "hidden"}>{stocks}</div>
      <div className={view === "mojis" ? "flex flex-col gap-5" : "hidden"}>{mojis}</div>
    </div>
  );
}
