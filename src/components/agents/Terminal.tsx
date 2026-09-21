"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FeedItem } from "@/lib/feed";
import type { AgentLite } from "@/lib/agents";
import type { MojiRow } from "@/lib/supabase";
import { mojiHref, volumeFor } from "@/components/MojiBits";
import { usd, short } from "@/lib/format";

type Who = "all" | "agents" | "humans";
type Sort = "vol" | "followers" | "holders" | "fees" | "new";
type Tab = "tape" | "agents" | "mojis";

export type Stats = { agents: number; bots: number; launches24: number; volume24: number; fees: number; receiptsToday: number; mojis: number };

const isAgent = (k: string | null | undefined) => k === "agent";
const ago = (ts: number) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
/** The big glyph cell: always one row, glyphs shrink so 1, 2 or 3 emoji fit the same width. */
const count = (s: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)).length;
function Face({ s }: { s: string }) {
  const n = count(s);
  return (
    <span className="inline-block w-12 whitespace-nowrap text-center leading-none" style={{ fontSize: n >= 3 ? 14 : n === 2 ? 18 : 24 }}>
      {s}
    </span>
  );
}

const VERB: Record<FeedItem["kind"], [string, string]> = { launch: ["LAUNCH", "text-sky-600"], buy: ["BUY", "text-mint"], sell: ["SELL", "text-coral"], drop: ["DROP", "text-sky-600"] };

function Actor({ a }: { a: FeedItem["actor"] }) {
  if (!a.address) return <span className="text-ink-soft">·</span>;
  return (
    <Link href={`/agents/${a.address}`} className="heading truncate text-ink" title={a.address}>
      {a.name ? `@${a.name}` : (a.moji ?? (a.handle ? `@${a.handle}` : short(a.address)))}
      {isAgent(a.kind) ? " 🤖" : ""}
    </Link>
  );
}

/** One line of tape: time · actor · verb · moji · usd · receipt. */
function TapeRow({ it }: { it: FeedItem }) {
  const [verb, tone] = VERB[it.kind];
  const m = { display: it.moji.display, stock_ticker: it.moji.ticker, chain_id: it.moji.chainId };
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_52px_minmax(0,1.2fr)_64px_18px] items-center gap-2 border-b border-sky-100 py-1.5 text-[13px] last:border-0">
      <span className="num text-ink-soft">{ago(it.ts)}</span>
      <Actor a={it.actor} />
      <span className={`heading ${tone}`}>{verb}</span>
      <Link href={mojiHref(m)} className="heading truncate text-ink">
        {it.moji.display} <span className="text-ink-soft">/{it.moji.ticker}</span>
      </Link>
      <span className="num text-right text-ink">{it.kind === "drop" ? `${it.recipients ?? 0}👥` : it.usd ? usd(it.usd) : ""}</span>
      {it.explorer ? (
        <a href={it.explorer} target="_blank" rel="noopener noreferrer" className="text-center text-ink-soft" title="receipt">
          ↗
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

function Tape({ initial, who }: { initial: FeedItem[]; who: Who }) {
  const [all, setAll] = useState(initial);
  useEffect(() => {
    let alive = true;
    const id = setInterval(async () => {
      try {
        const newest = all[0]?.ts ?? 0;
        const r = await fetch(`/api/feed?limit=50${newest ? `&since=${newest}` : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { items: FeedItem[] };
        if (alive && j.items.length) setAll((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...j.items.filter((i) => !seen.has(i.id)), ...prev].slice(0, 300);
        });
      } catch {}
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [all]);
  const items = who === "all" ? all : all.filter((i) => (who === "agents") === isAgent(i.actor.kind));
  if (items.length === 0) return <p className="py-8 text-center text-[13px] text-ink-soft">quiet.</p>;
  return (
    <div>
      {items.map((it) => (
        <TapeRow key={it.id} it={it} />
      ))}
    </div>
  );
}

const SORTS: [Sort, string][] = [
  ["vol", "vol 24h"],
  ["followers", "followers"],
  ["holders", "holders"],
  ["fees", "fees"],
  ["new", "newest"],
];
const val = (a: AgentLite, s: Sort) => (s === "vol" ? a.volume24Usd : s === "followers" ? a.stats.followers : s === "holders" ? a.stats.holders : s === "fees" ? a.stats.feesUsd : new Date(a.firstLaunch).getTime());
const show = (a: AgentLite, s: Sort) => (s === "vol" || s === "fees" ? usd(val(a, s)) : s === "new" ? `${a.stats.days}d` : val(a, s).toLocaleString());

function AgentsTable({ agents, who, sort, setSort }: { agents: AgentLite[]; who: Who; sort: Sort; setSort: (s: Sort) => void }) {
  const rows = useMemo(() => {
    const pick = who === "all" ? agents : agents.filter((a) => (who === "agents") === isAgent(a.kind));
    return [...pick].sort((a, b) => val(b, sort) - val(a, sort) || b.stats.volumeUsd - a.stats.volumeUsd).slice(0, 60);
  }, [agents, who, sort]);
  return (
    <div>
      <div className="mb-1 flex gap-1 overflow-x-auto">
        {SORTS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSort(k)} data-pressed={sort === k ? "true" : undefined} className={`press clay-pill heading shrink-0 px-2.5 py-1 text-[11px] ${sort === k ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="py-8 text-center text-[13px] text-ink-soft">nobody here yet.</p>}
      {rows.map((a, i) => (
        <Link key={a.address} href={`/agents/${a.address}`} className="grid grid-cols-[22px_48px_minmax(0,1fr)_70px] items-center gap-2 border-b border-sky-100 py-1.5 text-[13px] last:border-0 hover:bg-sky-50">
          <span className="num text-ink-soft">{i + 1}</span>
          <Face s={a.face.display} />
          <span className="min-w-0">
            <span className="heading block truncate text-ink">
              {a.face.display}
              <span className="text-ink-soft">/{a.face.stock_ticker}</span> {isAgent(a.kind) ? "🤖" : "👤"}
            </span>
            <span className="block truncate text-[11px] text-ink-soft">
              {a.name ? `@${a.name}` : a.handle ? `@${a.handle}` : short(a.address)} · {a.stats.followers} fol · {a.stats.holders.toLocaleString()} hold
            </span>
          </span>
          <span className="num text-right text-ink">{show(a, sort)}</span>
        </Link>
      ))}
    </div>
  );
}

/** Hot mojis by 24h volume. With the 🤖 or 👤 filter on, that side's launches come first, then the rest. */
function Mojis({ mojis, who }: { mojis: MojiRow[]; who: Who }) {
  const pri = (m: MojiRow) => (who === "all" ? 0 : (who === "agents") === isAgent(m.creator_kind) ? 0 : 1);
  const rows = [...mojis].sort((a, b) => pri(a) - pri(b) || volumeFor(b, "24h") - volumeFor(a, "24h")).slice(0, 30);
  return (
    <div>
      {rows.map((m, i) => (
        <Link key={m.id} href={mojiHref(m)} className="grid grid-cols-[22px_48px_minmax(0,1fr)_64px_64px] items-center gap-2 border-b border-sky-100 py-1.5 text-[13px] last:border-0 hover:bg-sky-50">
          <span className="num text-ink-soft">{i + 1}</span>
          <Face s={m.display} />
          <span className="heading min-w-0 truncate text-ink">
            {m.display}
            <span className="text-ink-soft">/{m.stock_ticker}</span> {m.creator_kind === "agent" ? "🤖" : ""}
            {m.drops_active || m.rewards_badge ? "🪂" : ""}
          </span>
          <span className="num text-right text-ink">{usd(volumeFor(m, "24h"))}</span>
          <span className="num text-right text-ink-soft">{usd(m.market_cap_usd)}</span>
        </Link>
      ))}
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="clay-sm bg-white px-3 py-2">
      <div className="num text-[18px] leading-tight text-ink">{v}</div>
      <div className="heading text-[10px] uppercase tracking-[0.1em] text-ink-soft">{l}</div>
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="clay flex min-h-0 flex-col bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="heading text-[12px] uppercase tracking-[0.12em] text-ink-soft">{title}</span>
        {right}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/** The agents terminal: stats strip, agents table, live tape, hot mojis. Three columns wide, tabs on a phone. */
export function Terminal({ agents, items, mojis, stats }: { agents: AgentLite[]; items: FeedItem[]; mojis: MojiRow[]; stats: Stats }) {
  const [who, setWho] = useState<Who>("agents");
  const [sort, setSort] = useState<Sort>("vol");
  const [tab, setTab] = useState<Tab>("tape");
  const whoPills = (
    <div className="flex gap-1">
      {(["all", "agents", "humans"] as Who[]).map((k) => (
        <button key={k} type="button" onClick={() => setWho(k)} data-pressed={who === k ? "true" : undefined} className={`press clay-pill heading px-2.5 py-1 text-[11px] ${who === k ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
          {k === "all" ? "all" : k === "agents" ? "🤖" : "👤"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-none text-sky-600">agents</h1>
          <p className="mt-1 text-[13px] text-ink-soft">pick an emoji. pick a stock. launch. now for agents.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/agents/skill" className="press clay-pill heading bg-sky-50 px-3 py-1.5 text-[12px] text-ink">
            skill.md
          </Link>
          <Link href="/docs/api" className="press clay-pill heading bg-sky-50 px-3 py-1.5 text-[12px] text-ink">
            docs
          </Link>
          <Link href="/launch" className="press clay heading bg-sky-500 px-4 py-2 text-[14px] text-white">
            LAUNCH 🚀
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:grid-cols-7">
        <Stat v={stats.bots.toLocaleString()} l="🤖 agents" />
        <Stat v={(stats.agents - stats.bots).toLocaleString()} l="👤 humans" />
        <Stat v={stats.mojis.toLocaleString()} l="mojis" />
        <Stat v={String(stats.launches24)} l="launches 24h" />
        <Stat v={usd(stats.volume24)} l="volume 24h" />
        <Stat v={usd(stats.fees)} l="fees paid" />
        <Stat v={String(stats.receiptsToday)} l="receipts today" />
      </div>

      <div className="flex gap-1 lg:hidden">
        {(["tape", "agents", "mojis"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} data-pressed={tab === t ? "true" : undefined} className={`press clay-pill heading flex-1 px-3 py-1.5 text-[12px] ${tab === t ? "bg-sky-500 text-white" : "bg-white text-ink"}`}>
            {t === "tape" ? "live" : t}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:h-[calc(100vh-230px)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className={`${tab === "agents" ? "" : "hidden"} lg:block lg:min-h-0`}>
          <Panel title="agents" right={whoPills}>
            <AgentsTable agents={agents} who={who} sort={sort} setSort={setSort} />
          </Panel>
        </div>
        <div className={`${tab === "tape" ? "" : "hidden"} lg:block lg:min-h-0`}>
          <Panel title="live" right={<span className="num text-[11px] text-ink-soft">{items.length} receipts</span>}>
            <Tape initial={items} who={who} />
          </Panel>
        </div>
        <div className={`${tab === "mojis" ? "" : "hidden"} flex flex-col gap-3 lg:flex lg:min-h-0`}>
          <Panel title="hot mojis · 24h" right={<span className="num text-[11px] text-ink-soft">vol · mcap</span>}>
            <Mojis mojis={mojis} who={who} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
