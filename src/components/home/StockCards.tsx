"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { MojiRow } from "@/lib/supabase";
import { CHAINS } from "@/config/chains";
import { usd } from "@/lib/format";
import { Pill } from "@/components/ui";
import { ChainSelect } from "@/components/ChainSelect";
import { CAPTION_GRADIENT, DropsDot, mojiHref } from "@/components/MojiBits";
import { MojiArt } from "@/components/MojiArt";
import { mojiTitle } from "@/lib/meme-coin";

export type StockGroup = {
  key: string;
  ticker: string;
  name: string;
  logo: string;
  price: number;
  changePct: number;
  stockMcap: number;
  stockVol: number;
  mojis: MojiRow[];
};

type Sort = "stockMcap" | "stockVol" | "mojiMcap" | "mojiVol" | "name";
const SORTS: [Sort, string][] = [
  ["mojiMcap", "moji mcap"],
  ["mojiVol", "volume"],
  ["stockMcap", "stock mcap"],
  ["name", "name"],
];
const PAGE = 12;

const sum = (ms: MojiRow[], f: (m: MojiRow) => number) => ms.reduce((s, m) => s + f(m), 0);
const mcap = (m: MojiRow) => Number(m.market_cap_usd ?? 0);
const vol = (m: MojiRow) => Number(m.volume24_usd ?? 0);
const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;

/** Client half of the "by stock" home view: sort, search, chain pills and the 3-wide card grid. Each card leads with the meme of its biggest moji. */
export function StockCards({ groups }: { groups: StockGroup[] }) {
  const [sort, setSort] = useState<Sort>("mojiMcap");
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);

  const chains = useMemo(() => {
    const present = new Set(groups.flatMap((g) => g.mojis.map((m) => m.chain_id)));
    return CHAINS.filter((c) => present.has(c.chainId));
  }, [groups]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    let rows = groups.map((g) => (chain ? { ...g, mojis: g.mojis.filter((m) => m.chain_id === chain) } : g)).filter((g) => g.mojis.length > 0);
    if (t) rows = rows.filter((g) => g.ticker.toLowerCase().includes(t) || g.name.toLowerCase().includes(t) || g.mojis.some((m) => m.display.toLowerCase().includes(t) || (m.name ?? "").toLowerCase().includes(t)));
    const by: Record<Sort, (g: StockGroup) => number | string> = {
      stockMcap: (g) => g.stockMcap,
      stockVol: (g) => g.stockVol,
      mojiMcap: (g) => sum(g.mojis, mcap),
      mojiVol: (g) => sum(g.mojis, vol),
      name: (g) => g.name.toLowerCase(),
    };
    const f = by[sort];
    rows.sort((a, b) => {
      const x = f(a);
      const y = f(b);
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y));
      return y - x || sum(b.mojis, mcap) - sum(a.mojis, mcap);
    });
    return rows;
  }, [groups, sort, q, chain]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {SORTS.map(([k, label]) => (
          <Pill key={k} active={sort === k} onClick={() => setSort(k)} className="px-3.5 py-1.5 text-[13px]">
            {label}
          </Pill>
        ))}
        <span className="flex-1" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search" className="clay-pill heading w-[180px] bg-white px-4 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-soft" />
        <ChainSelect chains={chains} value={chain} onChange={setChain} />
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-ink-soft">Nothing matches.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {list.slice(0, shown).map((g, i) => (
            <StockCard key={g.key} g={g} pop={Math.min(5, (i % 3) + 1)} />
          ))}
        </div>
      )}
      {list.length > shown && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="press clay-pill heading bg-sky-50 px-5 py-2.5 text-[14px] text-ink">
            show {Math.min(PAGE, list.length - shown)} more
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col items-end">
      <span className="num text-[15px] leading-tight text-ink">{value}</span>
      <span className="text-[10px] uppercase tracking-[0.08em] text-ink-soft">{label}</span>
    </span>
  );
}

function StockCard({ g, pop }: { g: StockGroup; pop: number }) {
  const total = sum(g.mojis, mcap);
  const share = (m: MojiRow) => (total > 0 ? (mcap(m) / total) * 100 : 100 / g.mojis.length);
  const [lead, ...rest] = g.mojis;
  const runners = rest.slice(0, 2);
  const others = rest.slice(2);
  const otherShare = others.reduce((s, m) => s + share(m), 0);
  const explore = `/explore?q=${encodeURIComponent(g.ticker)}`;
  const up = g.changePct >= 0;
  return (
    <article className={`clay pop pop-${pop} flex flex-col gap-3 bg-white p-4`}>
      <header className="flex items-center gap-3">
        {g.logo ? (
          <Image src={g.logo} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-2xl" />
        ) : (
          <span className="heading flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-[15px] text-sky-600">{g.ticker.slice(0, 4)}</span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="heading truncate text-[18px] leading-tight text-ink">{g.ticker}</span>
          <span className="truncate text-[12px] text-ink-soft">
            {g.name}
            {g.price > 0 && (
              <>
                {" · "}
                <span className="num text-ink">{usd(g.price, { compact: false })}</span>
                {g.changePct !== 0 && <span className={`num ${up ? "text-mint" : "text-coral"}`}> {up ? "+" : ""}{g.changePct.toFixed(1)}%</span>}
              </>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-start gap-3.5">
          {g.stockMcap > 0 && <Stat label="stock mcap" value={usd(g.stockMcap)} />}
          <Stat label="moji mcap" value={total > 0 ? usd(total) : "new"} />
          <Stat label="vol 24h" value={usd(sum(g.mojis, vol))} />
        </span>
      </header>
      <div className="grid grid-cols-[1.35fr_1fr] gap-3">
        <Link href={mojiHref(lead)} className="press clay-sm relative block overflow-hidden bg-sky-50" title={lead.description ?? undefined}>
          <MojiArt m={lead} radius={0} badge={false} emojiSize={88} />
          <span className="absolute left-3 top-3 text-[20px] leading-none drop-shadow" aria-label="biggest moji for this stock">
            👑
          </span>
          <DropsDot m={lead} className="absolute right-3 top-3 drop-shadow" />
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pb-2.5 pt-10 text-left text-white" style={{ background: CAPTION_GRADIENT }}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="heading truncate text-[15px] leading-tight">{mojiTitle(lead)}</span>
              <span className="text-[11px] leading-tight text-white/85">{mcap(lead) > 0 ? usd(mcap(lead)) : "just launched"}</span>
            </span>
            <span className="num shrink-0 text-[30px] leading-none">{pct(share(lead))}</span>
          </span>
        </Link>
        <div className="flex flex-col gap-2.5">
          {runners.map((m) => (
            <Link key={m.id} href={mojiHref(m)} className="press clay-sm relative flex flex-1 items-center gap-2.5 bg-sky-50 px-2.5 py-2">
              <MojiArt m={m} size={44} radius={12} badge={false} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="heading truncate text-[14px] leading-tight text-ink">{m.kind === "meme" && m.name ? m.name : m.display}</span>
                <span className="text-[11px] text-ink-soft">{mcap(m) > 0 ? usd(mcap(m)) : "just launched"}</span>
              </span>
              <span className="num text-[18px] leading-none text-ink">{pct(share(m))}</span>
              <DropsDot m={m} className="absolute right-2 top-1.5 !text-[14px]" />
            </Link>
          ))}
          {runners.length === 0 && (
            <Link href="/launch" className="press clay-sm flex flex-1 flex-col items-center justify-center bg-sky-50 px-2 py-3 text-center text-[13px] text-sky-600">
              be the challenger
            </Link>
          )}
          {others.length > 0 && (
            <div className="flex items-center gap-1.5 whitespace-nowrap px-1">
              {others.slice(0, 3).map((m) => (
                <Link key={m.id} href={mojiHref(m)} className="press shrink-0" title={`${m.display} / ${m.stock_ticker}`}>
                  <MojiArt m={m} size={28} radius={8} badge={false} emojiSize={16} />
                </Link>
              ))}
              <Link href={explore} className="press truncate text-[12px] text-sky-600">
                +{others.length} more ›
              </Link>
              <span className="num ml-auto shrink-0 text-[12px] text-ink-soft">{pct(otherShare)}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
