"use client";

import { MEME_NAME_MAX } from "@/lib/meme-coin";

/** Step 3 of a meme launch: title and ticker. The ticker is the claim (`$PEPE`), checked live like an emoji combo. */
export function MemeSlots({ name, symbol, onName, onSymbol }: { name: string; symbol: string; onName: (v: string) => void; onSymbol: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[1fr_140px] gap-2">
      <input value={name} onChange={(e) => onName(e.target.value)} maxLength={MEME_NAME_MAX} placeholder="title, like Pepe" autoComplete="off" className="clay-input heading text-[16px]" />
      <div className="relative">
        <span className="heading pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-ink-soft">$</span>
        <input value={symbol} onChange={(e) => onSymbol(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10))} placeholder="PEPE" autoComplete="off" spellCheck={false} className="clay-input heading !pl-8 text-[16px] uppercase" />
      </div>
    </div>
  );
}
