"use client";

import Link from "next/link";
import { useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { MojiTile } from "./MojiBits";
import { Pill } from "./ui";
import { ClaimsCounter } from "./ClaimsCounter";

/** Home grid: top mojis by market cap, or the newest launches. */
export function HomeTiles({ top, recent, count }: { top: MojiRow[]; recent: MojiRow[]; count: number }) {
  const [tab, setTab] = useState<"top" | "new">("top");
  const rows = tab === "top" ? top : recent;
  return (
    <section className="clay pop pop-5 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <ClaimsCounter initial={count} />
        <div className="flex gap-2">
          <Pill active={tab === "top"} onClick={() => setTab("top")} className="px-3.5 py-1.5 text-[13px]">
            top
          </Pill>
          <Pill active={tab === "new"} onClick={() => setTab("new")} className="px-3.5 py-1.5 text-[13px]">
            just launched
          </Pill>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-[14px] text-ink-soft">Nothing yet. Be first.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rows.map((m, i) => (
            <MojiTile key={m.id} m={m} pop={Math.min(5, i)} />
          ))}
        </div>
      )}
      <Link href="/explore" className="press clay-pill heading mt-4 block bg-sky-50 px-4 py-2.5 text-center text-[14px] text-ink">
        see all
      </Link>
    </section>
  );
}
