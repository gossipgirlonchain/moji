"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { mojiHref } from "@/components/MojiBits";
import { usd, short, timeAgo } from "@/lib/format";

const VERB: Record<FeedItem["kind"], string> = { launch: "launched", buy: "bought", sell: "sold", drop: "dropped" };
const TONE: Record<FeedItem["kind"], string> = { launch: "bg-sky-50", buy: "bg-mint/10", sell: "bg-coral/10", drop: "bg-sky-50" };

function ActorLink({ a }: { a: FeedItem["actor"] }) {
  if (!a.address) return <span className="text-ink-soft">someone</span>;
  const name = a.moji ? `${a.kind === "agent" ? "🤖 " : ""}${a.moji}` : a.handle ? `@${a.handle}` : short(a.address);
  return (
    <Link href={`/agents/${a.address}`} className="heading text-ink">
      {name}
    </Link>
  );
}

export function FeedRow({ it }: { it: FeedItem }) {
  const m = { display: it.moji.display, stock_ticker: it.moji.ticker, chain_id: it.moji.chainId };
  return (
    <div className={`clay-sm flex items-center gap-3 px-4 py-3 ${TONE[it.kind]}`}>
      <span className="text-[26px] leading-none">{it.moji.display}</span>
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">
        <ActorLink a={it.actor} /> {VERB[it.kind]}{" "}
        <Link href={mojiHref(m)} className="heading text-sky-600">
          {it.moji.display} / {it.moji.ticker}
        </Link>
        {it.kind === "buy" || it.kind === "sell" ? <span className="text-ink-soft">{it.usd ? ` for ${usd(it.usd)}` : ""}</span> : null}
        {it.kind === "drop" ? <span className="text-ink-soft">{` ${it.amountOut?.amount ?? ""} ${it.amountOut?.symbol ?? ""} to ${it.recipients ?? 0} holders`}</span> : null}
        <span className="block text-[12px] text-ink-soft">
          {timeAgo(new Date(it.ts * 1000).toISOString())}
          {it.explorer && (
            <>
              {" · "}
              <a href={it.explorer} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                receipt ↗
              </a>
            </>
          )}
        </span>
      </span>
    </div>
  );
}

/** The receipts, live: renders the server's list, then polls /api/feed for anything newer every 20s. */
export function Timeline({ initial, actor, pollMs = 20_000, filter }: { initial: FeedItem[]; actor?: string; pollMs?: number; filter?: (it: FeedItem) => boolean }) {
  const [all, setItems] = useState<FeedItem[]>(initial);
  const items = filter ? all.filter(filter) : all;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const newest = all[0]?.ts ?? 0;
        const r = await fetch(`/api/feed?limit=50${newest ? `&since=${newest}` : ""}${actor ? `&actor=${actor}` : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { items: FeedItem[] };
        if (alive && j.items.length) setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...j.items.filter((i) => !seen.has(i.id)), ...prev].slice(0, 200);
        });
      } catch {}
    };
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [all, actor, pollMs]);

  if (items.length === 0) return <p className="py-6 text-center text-[14px] text-ink-soft">Nothing yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <FeedRow key={it.id} it={it} />
      ))}
    </div>
  );
}
