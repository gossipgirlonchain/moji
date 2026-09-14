"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label } from "./ui";
import {
  ACTIVE_STAGES,
  CLOSED_STAGES,
  EVENT_LABEL,
  FOLLOWER_BANDS,
  PRIORITIES,
  PRIORITY_LABEL,
  RATE_LABEL,
  STAGES,
  STAGE_LABEL,
  bandRank,
  tgUrl,
  xUrl,
  type CreatorEvent,
  type CreatorRow,
  type EventKind,
  type Patch,
  type Priority,
  type Rates,
  type Stage,
} from "@/lib/creators";
import { timeAgo } from "@/lib/format";

/**
 * /creators: outreach pipeline for the Ratio applicants (and anyone added by hand).
 * Pipeline view = one column per stage. List view = sortable table with bulk actions.
 * Click a creator to open the drawer: profile, rates, pipeline fields, timeline, DM copy.
 */

type LastEvent = Record<string, { at: string; kind: string }>;
type Payload = { creators: CreatorRow[]; lastEvent: LastEvent; error?: string };
type View = "pipeline" | "list";
type SortKey = "priority" | "updated" | "applied" | "followers" | "name" | "follow_up";

const DM_KEY = "moji_creators_dm";
const DEFAULT_DM = `hey {first}! saw your Ratio creator application. we're launching moji.wtf: pick an emoji, pick a stock, launch a token on Doppler. would love to have you cover the launch. what does a {format} look like for you rate-wise this month?`;

const STAGE_TONE: Record<Stage, string> = {
  new: "bg-sky-100 text-sky-600",
  reached_out: "bg-sky-200 text-ink",
  replied: "bg-mint/30 text-ink",
  negotiating: "bg-mint/60 text-ink",
  agreed: "bg-mint text-white",
  posted: "bg-sky-500 text-white",
  paid: "bg-sky-600 text-white",
  declined: "bg-coral/60 text-white",
  no_response: "bg-sky-100 text-ink-soft",
};


/** Short stage names for the "→ next" button on a 264px card. */
const STAGE_SHORT: Record<Stage, string> = { new: "new", reached_out: "sent", replied: "replied", negotiating: "talks", agreed: "agreed", posted: "posted", paid: "paid", declined: "declined", no_response: "no reply" };

function isDue(iso: string | null): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() <= Date.now();
}
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
function fillTemplate(t: string, c: CreatorRow): string {
  return t.replace(/\{name\}/g, c.name).replace(/\{first\}/g, firstName(c.name)).replace(/\{handle\}/g, `@${c.x_handle}`).replace(/\{format\}/g, "post + thread");
}
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreatorsBoard() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("pipeline");
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState<Stage | "">("");
  const [fPriority, setFPriority] = useState<Priority | -1>(-1);
  const [fFollowers, setFFollowers] = useState("");
  const [fAudience, setFAudience] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [fStarred, setFStarred] = useState(false);
  const [fDue, setFDue] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDm, setShowDm] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [dm, setDm] = useState(DEFAULT_DM);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DM_KEY);
      if (saved) setDm(saved);
    } catch {}
  }, []);
  const saveDm = (t: string) => {
    setDm(t);
    try {
      localStorage.setItem(DM_KEY, t);
    } catch {}
  };
  const toast = useCallback((t: string) => {
    setFlash(t);
    setTimeout(() => setFlash((s) => (s === t ? null : s)), 2000);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/creators", { cache: "no-store" });
      if (r.status === 401) return router.refresh();
      const j = (await r.json()) as Payload;
      if (!r.ok) throw new Error(j.error ?? "failed");
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);

  /** Replace rows in local state after a server write. */
  const merge = useCallback((rows: CreatorRow[]) => {
    setData((d) => {
      if (!d) return d;
      const map = new Map(d.creators.map((c) => [c.id, c]));
      for (const r of rows) map.set(r.id, r);
      return { ...d, creators: Array.from(map.values()) };
    });
  }, []);
  const touch = useCallback((ids: string[], kind: string) => {
    const at = new Date().toISOString();
    setData((d) => (d ? { ...d, lastEvent: { ...d.lastEvent, ...Object.fromEntries(ids.map((id) => [id, { at, kind }])) } } : d));
  }, []);

  const patch = useCallback(
    async (id: string, p: Patch): Promise<CreatorRow | null> => {
      const r = await fetch(`/api/creators/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
      const j = (await r.json()) as { creator?: CreatorRow; error?: string };
      if (!r.ok || !j.creator) {
        toast(j.error ?? "save failed");
        return null;
      }
      merge([j.creator]);
      if (p.stage) touch([id], "stage");
      return j.creator;
    },
    [merge, toast, touch],
  );
  const logEvent = useCallback(
    async (id: string, kind: EventKind, body?: string): Promise<{ creator: CreatorRow; event: CreatorEvent } | null> => {
      const r = await fetch(`/api/creators/${id}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, body }) });
      const j = (await r.json()) as { creator?: CreatorRow; event?: CreatorEvent; error?: string };
      if (!r.ok || !j.creator || !j.event) {
        toast(j.error ?? "log failed");
        return null;
      }
      merge([j.creator]);
      touch([id], kind);
      return { creator: j.creator, event: j.event };
    },
    [merge, toast, touch],
  );
  const bulk = useCallback(
    async (ids: string[], p: Patch, event?: { kind: EventKind; body?: string }) => {
      const r = await fetch("/api/creators/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, patch: p, event }) });
      const j = (await r.json()) as { creators?: CreatorRow[]; error?: string };
      if (j.creators) merge(j.creators);
      if (event) touch(ids, event.kind);
      if (!r.ok) toast(j.error ?? "bulk failed");
      else toast(`updated ${j.creators?.length ?? 0}`);
      setSelected(new Set());
    },
    [merge, toast, touch],
  );

  const creators = useMemo(() => data?.creators ?? [], [data]);
  const owners = useMemo(() => Array.from(new Set(creators.map((c) => c.owner).filter((o): o is string => Boolean(o)))).sort(), [creators]);
  const audiences = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of creators) for (const a of c.audience) if (!a.startsWith("Other")) n.set(a, (n.get(a) ?? 0) + 1);
    return Array.from(n.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([a]) => a);
  }, [creators]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = creators.filter((c) => {
      if (fStage && c.stage !== fStage) return false;
      if (fPriority >= 0 && c.priority !== fPriority) return false;
      if (fFollowers && c.followers !== fFollowers) return false;
      if (fAudience && !c.audience.includes(fAudience)) return false;
      if (fOwner && c.owner !== fOwner) return false;
      if (fStarred && !c.starred) return false;
      if (fDue && !isDue(c.next_follow_up_at)) return false;
      if (needle) {
        const hay = `${c.name} ${c.x_handle} ${c.telegram_handle ?? ""} ${c.tags.join(" ")} ${c.notes ?? ""} ${c.owner ?? ""} ${c.audience.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const cmp: Record<SortKey, (a: CreatorRow, b: CreatorRow) => number> = {
      priority: (a, b) => b.priority - a.priority || Number(b.starred) - Number(a.starred) || bandRank(b.followers, FOLLOWER_BANDS) - bandRank(a.followers, FOLLOWER_BANDS) || a.name.localeCompare(b.name),
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      applied: (a, b) => (b.applied_at ?? b.created_at).localeCompare(a.applied_at ?? a.created_at),
      followers: (a, b) => bandRank(b.followers, FOLLOWER_BANDS) - bandRank(a.followers, FOLLOWER_BANDS) || b.priority - a.priority,
      name: (a, b) => a.name.localeCompare(b.name),
      follow_up: (a, b) => (a.next_follow_up_at ?? "9").localeCompare(b.next_follow_up_at ?? "9"),
    };
    return rows.sort(cmp[sort]);
  }, [creators, q, fStage, fPriority, fFollowers, fAudience, fOwner, fStarred, fDue, sort]);

  const counts = useMemo(() => {
    const n = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    let due = 0;
    let starred = 0;
    for (const c of creators) {
      n[c.stage]++;
      if (isDue(c.next_follow_up_at) && !CLOSED_STAGES.includes(c.stage)) due++;
      if (c.starred) starred++;
    }
    return { n, due, starred };
  }, [creators]);

  const open = openId ? creators.find((c) => c.id === openId) ?? null : null;
  const anyFilter = Boolean(q || fStage || fPriority >= 0 || fFollowers || fAudience || fOwner || fStarred || fDue);

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6 lg:grid-cols-9">
        <Tile v={creators.length} k="creators" />
        <Tile v={counts.n.new} k="new" />
        <Tile v={counts.n.reached_out} k="reached out" />
        <Tile v={counts.n.replied} k="replied" />
        <Tile v={counts.n.negotiating + counts.n.agreed} k="in talks" tone="mint" />
        <Tile v={counts.n.posted + counts.n.paid} k="posted" tone="mint" />
        <Tile v={counts.n.declined + counts.n.no_response} k="closed" />
        <Tile v={counts.starred} k="starred" />
        <Tile v={counts.due} k="follow-ups due" tone={counts.due ? "coral" : "ink"} />
      </div>

      {/* Toolbar */}
      <div className="clay flex flex-wrap items-center gap-2 bg-white p-3">
        <div className="flex gap-1">
          {(["pipeline", "list"] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} data-pressed={view === v ? "true" : undefined} className={`press clay-pill heading px-4 py-2 text-[13px] ${view === v ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
              {v}
            </button>
          ))}
        </div>
        <input className="clay-input !w-auto min-w-[180px] flex-1 !py-2 text-[14px]" placeholder="search name, handle, tags, notes" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={fStage} onChange={(v) => setFStage(v as Stage | "")} options={[["", "any stage"], ...STAGES.map((s) => [s, `${STAGE_LABEL[s]} (${counts.n[s]})`] as [string, string])]} />
        <Select value={String(fPriority)} onChange={(v) => setFPriority(Number(v) as Priority | -1)} options={[["-1", "any priority"], ...[...PRIORITIES].reverse().map((p) => [String(p), `${"★".repeat(p) || "no"} priority`] as [string, string])]} />
        <Select value={fFollowers} onChange={setFFollowers} options={[["", "any followers"], ...FOLLOWER_BANDS.map((b) => [b, b] as [string, string])]} />
        <Select value={fAudience} onChange={setFAudience} options={[["", "any audience"], ...audiences.map((a) => [a, a] as [string, string])]} />
        {owners.length > 0 && <Select value={fOwner} onChange={setFOwner} options={[["", "any owner"], ...owners.map((o) => [o, o] as [string, string])]} />}
        <Toggle on={fStarred} onClick={() => setFStarred((s) => !s)}>★ starred</Toggle>
        <Toggle on={fDue} onClick={() => setFDue((s) => !s)}>due</Toggle>
        {anyFilter && (
          <button
            type="button"
            className="heading text-[12px] text-ink-soft underline"
            onClick={() => {
              setQ("");
              setFStage("");
              setFPriority(-1);
              setFFollowers("");
              setFAudience("");
              setFOwner("");
              setFStarred(false);
              setFDue(false);
            }}
          >
            clear
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="heading text-[12px] text-ink-soft">{filtered.length} shown</span>
          <Toggle on={showDm} onClick={() => setShowDm((s) => !s)}>DM template</Toggle>
          <Toggle on={showAdd} onClick={() => setShowAdd((s) => !s)}>+ add</Toggle>
          <button type="button" onClick={() => window.open("/api/creators/export", "_blank")} className="press clay-pill heading bg-sky-50 px-3 py-2 text-[13px] text-ink">
            export csv
          </button>
        </span>
      </div>

      {showDm && (
        <div className="clay flex flex-col gap-2 bg-white p-4">
          <Label>DM template</Label>
          <textarea className="clay-input min-h-[96px] text-[14px]" value={dm} onChange={(e) => saveDm(e.target.value)} />
          <p className="text-[12px] text-ink-soft">
            Placeholders: <code>{"{name}"}</code>, <code>{"{first}"}</code>, <code>{"{handle}"}</code>, <code>{"{format}"}</code>. Saved in this browser. Copy from any creator&apos;s drawer or card.
          </p>
        </div>
      )}
      {showAdd && (
        <AddCreator
          onAdded={(c) => {
            merge([c]);
            setShowAdd(false);
            setOpenId(c.id);
            toast(`added @${c.x_handle}`);
          }}
          onError={toast}
        />
      )}

      {err && <p className="text-center text-[13px] text-coral">{err}</p>}
      {!data ? (
        <p className="text-center text-[14px] text-ink-soft">loading creators…</p>
      ) : view === "pipeline" ? (
        <Pipeline rows={filtered} lastEvent={data.lastEvent} onOpen={setOpenId} onMove={(id, stage) => void patch(id, { stage })} onCopy={(c) => copyDm(c, dm, toast)} />
      ) : (
        <Table rows={filtered} lastEvent={data.lastEvent} sort={sort} setSort={setSort} selected={selected} setSelected={setSelected} onOpen={setOpenId} onPatch={patch} />
      )}

      {selected.size > 0 && <BulkBar count={selected.size} owners={owners} onApply={(p, ev) => void bulk(Array.from(selected), p, ev)} onClear={() => setSelected(new Set())} />}

      {open && (
        <Drawer
          creator={open}
          owners={owners}
          onClose={() => setOpenId(null)}
          onPatch={(p) => patch(open.id, p)}
          onEvent={(k, b) => logEvent(open.id, k, b)}
          onCopy={() => copyDm(open, dm, toast)}
          onDeleted={() => {
            setData((d) => (d ? { ...d, creators: d.creators.filter((c) => c.id !== open.id) } : d));
            setOpenId(null);
          }}
          toast={toast}
        />
      )}

      {flash && <div className="clay-sm fixed bottom-6 left-1/2 z-50 -translate-x-1/2 bg-ink px-4 py-2 text-[13px] text-white">{flash}</div>}

      <button
        onClick={async () => {
          await fetch("/api/admin/login", { method: "DELETE" });
          router.refresh();
        }}
        className="heading mx-auto text-[13px] text-ink-soft"
      >
        lock admin
      </button>
    </div>
  );
}

async function copyDm(c: CreatorRow, dm: string, toast: (t: string) => void) {
  try {
    await navigator.clipboard.writeText(fillTemplate(dm, c));
    toast(`DM for @${c.x_handle} copied`);
  } catch {
    toast("clipboard blocked");
  }
}

/* ---------- small bits ---------- */

function Tile({ v, k, tone = "ink" }: { v: number; k: string; tone?: "ink" | "mint" | "coral" }) {
  const c = { ink: "text-ink", mint: "text-mint", coral: "text-coral" }[tone];
  return (
    <div className="clay-sm bg-white px-2 py-2 text-center">
      <div className={`num text-[20px] leading-none ${c}`}>{v}</div>
      <div className="heading mt-1 text-[9px] uppercase tracking-[0.1em] text-ink-soft">{k}</div>
    </div>
  );
}

function Select({ value, onChange, options, className = "" }: { value: string; onChange: (v: string) => void; options: [string, string][]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`clay-pill heading cursor-pointer bg-sky-50 px-3 py-2 text-[13px] text-ink outline-none ${className}`}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-pressed={on ? "true" : undefined} className={`press clay-pill heading px-3 py-2 text-[13px] ${on ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
      {children}
    </button>
  );
}

function Stars({ p, onChange }: { p: Priority; onChange?: (p: Priority) => void }) {
  return (
    <span className="inline-flex gap-0.5" title={`priority: ${PRIORITY_LABEL[p]}`}>
      {[1, 2, 3].map((i) => {
        const cls = `text-[13px] leading-none ${i <= p ? "text-sky-500" : "text-sky-200"}`;
        return onChange ? (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange((p === i ? i - 1 : i) as Priority);
            }}
            className={`${cls} cursor-pointer`}
          >
            ★
          </button>
        ) : (
          <span key={i} className={cls}>
            ★
          </span>
        );
      })}
    </span>
  );
}

function StagePill({ s }: { s: Stage }) {
  return <span className={`clay-pill heading inline-block px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] ${STAGE_TONE[s]}`}>{STAGE_LABEL[s]}</span>;
}

function Band({ b }: { b: string | null }) {
  if (!b) return null;
  return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-ink-soft">{b}</span>;
}

/* ---------- pipeline ---------- */

function Pipeline({ rows, lastEvent, onOpen, onMove, onCopy }: { rows: CreatorRow[]; lastEvent: LastEvent; onOpen: (id: string) => void; onMove: (id: string, s: Stage) => void; onCopy: (c: CreatorRow) => void }) {
  const [showClosed, setShowClosed] = useState(false);
  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s, [] as CreatorRow[]])) as Record<Stage, CreatorRow[]>;
    for (const r of rows) m[r.stage].push(r);
    return m;
  }, [rows]);
  const closedCount = CLOSED_STAGES.reduce((n, s) => n + byStage[s].length, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="scroll-x -mx-5 flex gap-3 px-5 pb-2">
        {ACTIVE_STAGES.map((s, i) => (
          <Column key={s} stage={s} rows={byStage[s]} lastEvent={lastEvent} next={ACTIVE_STAGES[i + 1]} onOpen={onOpen} onMove={onMove} onCopy={onCopy} />
        ))}
      </div>
      <button type="button" onClick={() => setShowClosed((s) => !s)} className="heading mx-auto text-[12px] text-ink-soft">
        {showClosed ? "hide" : "show"} closed ({closedCount})
      </button>
      {showClosed && (
        <div className="scroll-x -mx-5 flex gap-3 px-5 pb-2">
          {CLOSED_STAGES.map((s) => (
            <Column key={s} stage={s} rows={byStage[s]} lastEvent={lastEvent} next="new" onOpen={onOpen} onMove={onMove} onCopy={onCopy} />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({ stage, rows, lastEvent, next, onOpen, onMove, onCopy }: { stage: Stage; rows: CreatorRow[]; lastEvent: LastEvent; next?: Stage; onOpen: (id: string) => void; onMove: (id: string, s: Stage) => void; onCopy: (c: CreatorRow) => void }) {
  return (
    <div className="flex w-[264px] shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <StagePill s={stage} />
        <span className="num text-[13px] text-ink-soft">{rows.length}</span>
      </div>
      <div className="scroll-y flex max-h-[70vh] flex-col gap-2 rounded-[20px] bg-sky-100/60 p-2">
        {rows.length === 0 && <p className="py-6 text-center text-[12px] text-ink-soft">empty</p>}
        {rows.map((c) => (
          <div key={c.id} role="button" tabIndex={0} onClick={() => onOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)} className="press clay-sm flex cursor-pointer flex-col gap-1.5 bg-white p-3 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="heading truncate text-[14px] text-ink">
                  {c.starred && <span className="text-sky-500">★ </span>}
                  {c.name}
                </div>
                <div className="truncate text-[12px] text-ink-soft">@{c.x_handle}</div>
              </div>
              <Stars p={c.priority} />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Band b={c.followers} />
              {c.owner && <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] text-ink">{c.owner}</span>}
              {c.tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-ink-soft">
                  #{t}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink-soft">
              <span>{lastEvent[c.id] ? `${EVENT_LABEL[lastEvent[c.id].kind as EventKind] ?? lastEvent[c.id].kind} ${timeAgo(lastEvent[c.id].at)}` : c.applied_at ? `applied ${fmtDate(c.applied_at)}` : ""}</span>
              {c.next_follow_up_at && <span className={isDue(c.next_follow_up_at) ? "heading text-coral" : ""}>↻ {fmtDate(c.next_follow_up_at)}</span>}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <a href={xUrl(c.x_handle)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="press clay-pill heading bg-sky-50 px-2.5 py-1 text-[11px] text-ink" title="open on X">
                𝕏
              </a>
              {c.telegram_handle && (
                <a href={tgUrl(c.telegram_handle) ?? "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="press clay-pill heading bg-sky-50 px-2.5 py-1 text-[11px] text-ink" title="open on Telegram">
                  TG
                </a>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(c);
                }}
                className="press clay-pill heading whitespace-nowrap bg-sky-50 px-2.5 py-1 text-[11px] text-ink"
                title="copy DM"
              >
                copy
              </button>
              {next && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(c.id, next);
                  }}
                  className="press clay-pill heading ml-auto min-w-0 truncate whitespace-nowrap bg-sky-500 px-2.5 py-1 text-[11px] text-white"
                  title={`move to ${STAGE_LABEL[next]}`}
                >
                  → {STAGE_SHORT[next]}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- list ---------- */

function Table({ rows, lastEvent, sort, setSort, selected, setSelected, onOpen, onPatch }: { rows: CreatorRow[]; lastEvent: LastEvent; sort: SortKey; setSort: (s: SortKey) => void; selected: Set<string>; setSelected: (s: Set<string>) => void; onOpen: (id: string) => void; onPatch: (id: string, p: Patch) => Promise<CreatorRow | null> }) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const H = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-2 py-2 text-left" onClick={() => setSort(k)}>
      <span className={`heading text-[11px] uppercase tracking-[0.1em] ${sort === k ? "text-sky-600" : "text-ink-soft"}`}>{children}</span>
    </th>
  );
  return (
    <div className="clay overflow-x-auto bg-white p-2">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className="px-2 py-2">
              <input type="checkbox" checked={allOn} onChange={toggleAll} />
            </th>
            <H k="name">creator</H>
            <H k="followers">followers</H>
            <th className="px-2 py-2 text-left">
              <span className="heading text-[11px] uppercase tracking-[0.1em] text-ink-soft">views 30d</span>
            </th>
            <th className="px-2 py-2 text-left">
              <span className="heading text-[11px] uppercase tracking-[0.1em] text-ink-soft">audience</span>
            </th>
            <H k="priority">priority</H>
            <th className="px-2 py-2 text-left">
              <span className="heading text-[11px] uppercase tracking-[0.1em] text-ink-soft">stage</span>
            </th>
            <th className="px-2 py-2 text-left">
              <span className="heading text-[11px] uppercase tracking-[0.1em] text-ink-soft">owner</span>
            </th>
            <H k="updated">last touch</H>
            <H k="follow_up">follow up</H>
            <H k="applied">applied</H>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={`cursor-pointer hover:bg-sky-50 ${selected.has(c.id) ? "bg-sky-50" : ""}`} onClick={() => onOpen(c.id)}>
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              </td>
              <td className="px-2 py-1.5">
                <div className="heading text-[14px] text-ink">
                  {c.starred && <span className="text-sky-500">★ </span>}
                  {c.name}
                </div>
                <div className="flex gap-2 text-[12px] text-ink-soft">
                  <a href={xUrl(c.x_handle)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-sky-600">
                    @{c.x_handle}
                  </a>
                  {c.telegram_handle && (
                    <a href={tgUrl(c.telegram_handle) ?? "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-sky-600">
                      tg:{c.telegram_handle}
                    </a>
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5 text-ink-soft">{c.followers ?? ""}</td>
              <td className="px-2 py-1.5 text-ink-soft">{c.avg_views_30d ?? ""}</td>
              <td className="max-w-[200px] truncate px-2 py-1.5 text-[12px] text-ink-soft" title={c.audience.join(", ")}>
                {c.audience.filter((a) => !a.startsWith("Other")).join(", ")}
              </td>
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <Stars p={c.priority} onChange={(p) => void onPatch(c.id, { priority: p })} />
              </td>
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <select value={c.stage} onChange={(e) => void onPatch(c.id, { stage: e.target.value as Stage })} className={`clay-pill heading cursor-pointer px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] outline-none ${STAGE_TONE[c.stage]}`}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1.5 text-[12px] text-ink-soft">{c.owner ?? ""}</td>
              <td className="px-2 py-1.5 text-[12px] text-ink-soft">{lastEvent[c.id] ? `${EVENT_LABEL[lastEvent[c.id].kind as EventKind] ?? lastEvent[c.id].kind} · ${timeAgo(lastEvent[c.id].at)}` : "—"}</td>
              <td className={`px-2 py-1.5 text-[12px] ${isDue(c.next_follow_up_at) ? "heading text-coral" : "text-ink-soft"}`}>{fmtDate(c.next_follow_up_at)}</td>
              <td className="px-2 py-1.5 text-[12px] text-ink-soft">{fmtDate(c.applied_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-8 text-center text-[13px] text-ink-soft">nothing matches</p>}
    </div>
  );
}

function BulkBar({ count, owners, onApply, onClear }: { count: number; owners: string[]; onApply: (p: Patch, ev?: { kind: EventKind; body?: string }) => void; onClear: () => void }) {
  const [owner, setOwner] = useState("");
  return (
    <div className="clay sticky bottom-4 z-30 flex flex-wrap items-center gap-2 bg-ink p-3 text-white">
      <span className="heading text-[13px]">{count} selected</span>
      <button type="button" onClick={() => onApply({}, { kind: "dm_x" })} className="press clay-pill heading bg-sky-500 px-3 py-1.5 text-[12px] text-white">
        mark DM&apos;d on X
      </button>
      <button type="button" onClick={() => onApply({}, { kind: "dm_telegram" })} className="press clay-pill heading bg-sky-500 px-3 py-1.5 text-[12px] text-white">
        mark DM&apos;d on TG
      </button>
      <select defaultValue="" onChange={(e) => e.target.value && onApply({ stage: e.target.value as Stage })} className="clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink outline-none">
        <option value="">set stage…</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <select defaultValue="" onChange={(e) => e.target.value && onApply({ priority: Number(e.target.value) as Priority })} className="clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink outline-none">
        <option value="">set priority…</option>
        {[...PRIORITIES].reverse().map((p) => (
          <option key={p} value={p}>
            {"★".repeat(p) || "none"} {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <span className="flex items-center gap-1">
        <input list="owners" placeholder="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="clay-pill w-[110px] bg-white px-3 py-1.5 text-[12px] text-ink outline-none" />
        <datalist id="owners">
          {owners.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <button type="button" disabled={!owner.trim()} onClick={() => onApply({ owner: owner.trim() })} className="press clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink">
          assign
        </button>
      </span>
      <button type="button" onClick={() => onApply({ starred: true })} className="press clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink">
        ★ star
      </button>
      <button type="button" onClick={onClear} className="heading ml-auto text-[12px] text-sky-200">
        clear selection
      </button>
    </div>
  );
}

/* ---------- add by hand ---------- */

function AddCreator({ onAdded, onError }: { onAdded: (c: CreatorRow) => void; onError: (t: string) => void }) {
  const [x, setX] = useState("");
  const [name, setName] = useState("");
  const [tg, setTg] = useState("");
  const [followers, setFollowers] = useState("");
  const [priority, setPriority] = useState<Priority>(0);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="clay flex flex-wrap items-end gap-2 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fetch("/api/creators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ x_handle: x, name, telegram_handle: tg, followers: followers || null, priority }) });
        const j = (await r.json()) as { creator?: CreatorRow; error?: string };
        setBusy(false);
        if (!r.ok || !j.creator) return onError(j.error ?? "add failed");
        onAdded(j.creator);
        setX("");
        setName("");
        setTg("");
      }}
    >
      <div className="flex flex-col gap-1">
        <Label>X handle</Label>
        <input className="clay-input !w-[180px] !py-2 text-[14px]" placeholder="@handle" value={x} onChange={(e) => setX(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Name</Label>
        <input className="clay-input !w-[180px] !py-2 text-[14px]" placeholder="optional" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Telegram</Label>
        <input className="clay-input !w-[160px] !py-2 text-[14px]" placeholder="optional" value={tg} onChange={(e) => setTg(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Followers</Label>
        <Select value={followers} onChange={setFollowers} options={[["", "unknown"], ...FOLLOWER_BANDS.map((b) => [b, b] as [string, string])]} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Priority</Label>
        <Stars p={priority} onChange={setPriority} />
      </div>
      <Button size="sm" className="!w-auto" disabled={busy || !x.trim()}>
        {busy ? "…" : "add creator"}
      </Button>
    </form>
  );
}

/* ---------- drawer ---------- */

function Drawer({ creator: c, owners, onClose, onPatch, onEvent, onCopy, onDeleted, toast }: { creator: CreatorRow; owners: string[]; onClose: () => void; onPatch: (p: Patch) => Promise<CreatorRow | null>; onEvent: (k: EventKind, b?: string) => Promise<{ creator: CreatorRow; event: CreatorEvent } | null>; onCopy: () => void; onDeleted: () => void; toast: (t: string) => void }) {
  const [events, setEvents] = useState<CreatorEvent[] | null>(null);
  const [notes, setNotes] = useState(c.notes ?? "");
  const [owner, setOwner] = useState(c.owner ?? "");
  const [tags, setTags] = useState(c.tags.join(", "));
  const [deal, setDeal] = useState(c.deal_usd?.toString() ?? "");
  const [follow, setFollow] = useState(toLocalInput(c.next_follow_up_at));
  const [tg, setTg] = useState(c.telegram_handle ?? "");
  const [evm, setEvm] = useState(c.evm_wallet ?? "");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset the form when a different creator opens (the component stays mounted while openId changes).
  useEffect(() => {
    setNotes(c.notes ?? "");
    setOwner(c.owner ?? "");
    setTags(c.tags.join(", "));
    setDeal(c.deal_usd?.toString() ?? "");
    setFollow(toLocalInput(c.next_follow_up_at));
    setTg(c.telegram_handle ?? "");
    setEvm(c.evm_wallet ?? "");
    setDirty(false);
    setEvents(null);
    let live = true;
    fetch(`/api/creators/${c.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { events?: CreatorEvent[] }) => live && setEvents(j.events ?? []))
      .catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mark = (k: keyof Patch) => (v: string) => {
    setDirty(true);
    ({ notes: setNotes, owner: setOwner, tags: setTags, deal_usd: setDeal, next_follow_up_at: setFollow, telegram_handle: setTg, evm_wallet: setEvm } as Record<string, (s: string) => void>)[k]?.(v);
  };
  const save = async () => {
    setSaving(true);
    const r = await onPatch({ notes, owner: owner || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), deal_usd: deal === "" ? null : Number(deal), next_follow_up_at: follow ? new Date(follow).toISOString() : null, telegram_handle: tg || null, evm_wallet: evm || null });
    setSaving(false);
    if (r) {
      setDirty(false);
      toast("saved");
    }
  };
  const addEvent = async (k: EventKind, body?: string) => {
    const r = await onEvent(k, body);
    if (r) setEvents((ev) => [r.event, ...(ev ?? [])]);
  };
  const snooze = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setFollow(toLocalInput(d.toISOString()));
    void onPatch({ next_follow_up_at: d.toISOString() }).then((r) => r && toast(`follow up ${fmtDate(r.next_follow_up_at)}`));
  };
  const rates = Object.entries(c.rates ?? {}).filter(([, v]) => typeof v === "number") as [keyof Rates, number][];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} />
      <aside className="scroll-y fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col gap-4 bg-sky-50 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void onPatch({ starred: !c.starred })} className={`text-[20px] leading-none ${c.starred ? "text-sky-500" : "text-sky-200"}`} title="star">
                ★
              </button>
              <h2 className="heading truncate text-[22px] text-ink">{c.name}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
              <a href={xUrl(c.x_handle)} target="_blank" rel="noopener noreferrer" className="hover:text-sky-600">
                @{c.x_handle}
              </a>
              {c.telegram_handle && (
                <a href={tgUrl(c.telegram_handle) ?? "#"} target="_blank" rel="noopener noreferrer" className="hover:text-sky-600">
                  tg:{c.telegram_handle}
                </a>
              )}
              <Band b={c.followers} />
              {c.avg_views_30d && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px]">{c.avg_views_30d} views</span>}
              <span className="text-[11px]">{c.source === "ratio" ? `via Ratio, ${fmtDate(c.applied_at)}` : "added by hand"}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="press clay-pill heading bg-white px-3 py-1.5 text-[13px] text-ink">
            close
          </button>
        </div>

        {/* stage + priority */}
        <div className="clay-sm flex flex-col gap-3 bg-white p-4">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button key={s} type="button" onClick={() => void onPatch({ stage: s })} data-pressed={c.stage === s ? "true" : undefined} className={`press clay-pill heading px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] ${c.stage === s ? STAGE_TONE[s] : "bg-sky-50 text-ink-soft"}`}>
                {STAGE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <Label>priority</Label>
              <Stars p={c.priority} onChange={(p) => void onPatch({ priority: p })} />
            </span>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => snooze(2)} className="press clay-pill heading bg-sky-50 px-2.5 py-1 text-[11px] text-ink">
                ↻ 2d
              </button>
              <button type="button" onClick={() => snooze(7)} className="press clay-pill heading bg-sky-50 px-2.5 py-1 text-[11px] text-ink">
                ↻ 1w
              </button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-soft">
            {(["reached_out_at", "replied_at", "agreed_at", "posted_at", "paid_at"] as const).map((k) => c[k] && (
              <span key={k}>
                {k.replace("_at", "").replace("_", " ")}: {fmtDate(c[k])}
              </span>
            ))}
          </div>
        </div>

        {/* quick actions */}
        <div className="flex flex-wrap gap-1.5">
          <a href={xUrl(c.x_handle)} target="_blank" rel="noopener noreferrer" onClick={() => void addEvent("dm_x")} className="press clay-pill heading bg-sky-500 px-3 py-1.5 text-[12px] text-white">
            DM on X
          </a>
          {c.telegram_handle && (
            <a href={tgUrl(c.telegram_handle) ?? "#"} target="_blank" rel="noopener noreferrer" onClick={() => void addEvent("dm_telegram")} className="press clay-pill heading bg-sky-500 px-3 py-1.5 text-[12px] text-white">
              DM on TG
            </a>
          )}
          <button type="button" onClick={onCopy} className="press clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink">
            copy DM
          </button>
          <button type="button" onClick={() => void addEvent("reply")} className="press clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink">
            they replied
          </button>
          <button type="button" onClick={() => void addEvent("post")} className="press clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink">
            they posted
          </button>
          <button type="button" onClick={() => void addEvent("payment")} className="press clay-pill heading bg-white px-3 py-1.5 text-[12px] text-ink">
            paid
          </button>
        </div>
        <p className="-mt-2 text-[11px] text-ink-soft">DM buttons open the profile and log the touch. A first DM moves them to reached out; a reply moves them to replied.</p>

        {/* pipeline fields */}
        <div className="clay-sm flex flex-col gap-3 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>owner</Label>
              <input list="owners-drawer" className="clay-input !py-2 text-[13px]" value={owner} onChange={(e) => mark("owner")(e.target.value)} placeholder="who's on it" />
              <datalist id="owners-drawer">
                {owners.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1">
              <Label>deal usd</Label>
              <input type="number" min={0} className="clay-input !py-2 text-[13px]" value={deal} onChange={(e) => mark("deal_usd")(e.target.value)} placeholder="agreed amount" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>tags</Label>
              <input className="clay-input !py-2 text-[13px]" value={tags} onChange={(e) => mark("tags")(e.target.value)} placeholder="video, spaces, es" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>follow up</Label>
              <input type="datetime-local" className="clay-input !py-2 text-[13px]" value={follow} onChange={(e) => mark("next_follow_up_at")(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>telegram</Label>
              <input className="clay-input !py-2 text-[13px]" value={tg} onChange={(e) => mark("telegram_handle")(e.target.value)} placeholder="handle" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>evm wallet</Label>
              <input className="clay-input !py-2 text-[13px]" value={evm} onChange={(e) => mark("evm_wallet")(e.target.value)} placeholder="0x…" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>notes</Label>
            <textarea className="clay-input min-h-[80px] !py-2 text-[13px]" value={notes} onChange={(e) => mark("notes")(e.target.value)} placeholder="what they want, what we offered, blockers" />
          </div>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "…" : dirty ? "save" : "saved"}
          </Button>
        </div>

        {/* application */}
        <div className="clay-sm flex flex-col gap-2 bg-white p-4">
          <Label>from their application</Label>
          {c.audience.length > 0 && <p className="text-[12px] text-ink-soft">{c.audience.join(" · ")}</p>}
          {rates.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {rates.map(([k, v]) => (
                <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-ink">
                  {RATE_LABEL[k] ?? k} <b>${v}</b>
                </span>
              ))}
            </div>
          )}
          {c.best_posts.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {c.best_posts.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="truncate text-[12px] text-sky-600 hover:underline">
                  {u}
                </a>
              ))}
            </div>
          )}
          {c.telegram_channel && <p className="text-[12px] text-ink-soft">channel: {c.telegram_channel}</p>}
          {c.application_notes && <p className="whitespace-pre-wrap text-[12px] text-ink">{c.application_notes}</p>}
          {c.sol_wallet && (
            <p className="mono truncate text-[11px] text-ink-soft" title={c.sol_wallet}>
              sol: {c.sol_wallet}
            </p>
          )}
          {c.evm_wallet && (
            <p className="mono truncate text-[11px] text-ink-soft" title={c.evm_wallet}>
              evm: {c.evm_wallet}
            </p>
          )}
        </div>

        {/* timeline */}
        <div className="clay-sm flex flex-col gap-2 bg-white p-4">
          <Label>timeline</Label>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              await addEvent("note", note.trim());
              setNote("");
            }}
          >
            <input className="clay-input !py-2 text-[13px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="add a note" />
            <Button size="sm" className="!w-auto" disabled={!note.trim()}>
              add
            </Button>
          </form>
          {events === null ? (
            <p className="text-[12px] text-ink-soft">loading…</p>
          ) : events.length === 0 ? (
            <p className="text-[12px] text-ink-soft">no touches yet</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2 text-[12px]">
                  <span className="shrink-0 text-ink-soft">{timeAgo(e.created_at)}</span>
                  <span className="heading shrink-0 text-ink">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  {e.body && <span className="whitespace-pre-wrap text-ink-soft">{e.body}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between pt-2 text-[11px] text-ink-soft">
          <span>updated {timeAgo(c.updated_at)}</span>
          {c.source === "manual" && (
            <button
              type="button"
              className="text-coral underline"
              onClick={async () => {
                if (!confirm(`Remove @${c.x_handle} from the pipeline?`)) return;
                const r = await fetch(`/api/creators/${c.id}`, { method: "DELETE" });
                if (r.ok) onDeleted();
                else toast("delete failed");
              }}
            >
              remove
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
