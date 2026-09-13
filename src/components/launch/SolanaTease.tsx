"use client";

import { SOLANA_TOKENS } from "@/config/tokens";
import { Label } from "@/components/ui";

const text = encodeURIComponent("@mojidotwtf ship solana already 🫡 i want to launch on PENGU");

/** Solana isn't launchable yet (Doppler is on Solana devnet). Show what's coming and let people ask for it. */
export function SolanaTease() {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Label>2 · Pair</Label>
        <span className="clay-pill heading bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-sky-600">soon</span>
      </div>
      <p className="mb-3 text-[14px] text-ink">Solana is next. These are the pairs it launches with.</p>
      <div className="grid grid-cols-2 gap-2">
        {SOLANA_TOKENS.map((t) => (
          <div key={t.mint} className="flex items-center gap-2.5 bg-sky-50 px-3 py-2.5 opacity-80" style={{ borderRadius: "var(--r-sm)", boxShadow: "var(--clay-press)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://dd.dexscreener.com/ds-data/tokens/solana/${t.mint}.png`} alt="" width={28} height={28} className="h-7 w-7 shrink-0 bg-white object-cover" style={{ borderRadius: 999 }} loading="lazy" />
            <span className="min-w-0">
              <span className="heading block text-[14px] text-ink">{t.ticker}</span>
              <span className="block truncate text-[11px] text-ink-soft">{t.name}</span>
            </span>
          </div>
        ))}
      </div>
      <a href={`https://x.com/intent/post?text=${text}`} target="_blank" rel="noopener noreferrer" className="press clay heading mt-4 flex w-full items-center justify-center gap-2 bg-white px-5 py-3 text-[15px] text-ink">
        <span className="text-[18px]">𝕏</span> tell us you want it
      </a>
    </>
  );
}
