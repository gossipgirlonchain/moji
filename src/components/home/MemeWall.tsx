"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { Label } from "@/components/ui";
import { MojiArt } from "@/components/MojiArt";
import { mojiHref, volumeFor } from "@/components/MojiBits";
import { isMeme, mojiTitle } from "@/lib/meme-coin";

/** Pictures on the first paint; "show more" reveals the rest a page at a time. */
const FIRST = 24;
/** The newest memes lead the wall, then the rest by 24h volume. */
const NEWEST = 12;

/**
 * Desktop home, first thing under the header: a 6-wide wall of memes: memecoins (always pictured) and mojis
 * that carry a picture. The picture edge to edge, the name ("🍏 / AAPL", or a meme's title) on hover, click
 * goes to the token page.
 */
export function MemeWall({ mojis }: { mojis: MojiRow[] }) {
  const [shown, setShown] = useState(FIRST);
  const list = useMemo(() => {
    const pictured = mojis.filter((m) => m.meme_url);
    const byNewest = (a: MojiRow, b: MojiRow) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime();
    // Memecoins lead, newest first; then the newest pictured mojis; then everything else by 24h volume.
    const memes = pictured.filter((m) => isMeme(m)).sort(byNewest);
    const seen = new Set(memes.map((m) => m.id));
    const newest = pictured.filter((m) => !seen.has(m.id)).sort(byNewest).slice(0, NEWEST);
    for (const m of newest) seen.add(m.id);
    const hot = pictured.filter((m) => !seen.has(m.id)).sort((a, b) => volumeFor(b, "24h") - volumeFor(a, "24h") || Number(b.market_cap_usd ?? 0) - Number(a.market_cap_usd ?? 0));
    return [...memes, ...newest, ...hot];
  }, [mojis]);
  if (list.length === 0) return null;
  return (
    <section className="pop pop-1 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <Label>Meme wall</Label>
        <span className="heading text-[13px] text-sky-600">
          {list.length} picture{list.length === 1 ? "" : "s"} · memecoins first, then the newest mojis, then the hottest
        </span>
      </div>
      <div className="grid grid-cols-6 gap-3">
        {list.slice(0, shown).map((m, i) => (
          <Link key={m.id} href={mojiHref(m)} className="press group clay-sm relative block overflow-hidden bg-sky-50" title={m.description ?? `${m.display} / ${m.stock_ticker}`}>
            <MojiArt m={m} radius={0} badge={false} eager={i < 6} />
            <span className="absolute inset-0 flex items-end justify-center p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" style={{ background: "linear-gradient(to top, rgba(18, 64, 92, 0.55), rgba(18, 64, 92, 0) 60%)" }}>
              <span className="heading max-w-full truncate rounded-full bg-white/92 px-3 py-1.5 text-[15px] leading-none text-ink shadow-sm">{mojiTitle(m)}</span>
            </span>
          </Link>
        ))}
      </div>
      {list.length > shown && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + FIRST)} className="press clay-pill heading bg-white px-5 py-2.5 text-[14px] text-ink">
            show {Math.min(FIRST, list.length - shown)} more
          </button>
        </div>
      )}
    </section>
  );
}
