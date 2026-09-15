"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Label } from "./ui";
import {
  TEMPLATES,
  TEMPLATE_LABEL,
  SIZES,
  LIMITS,
  cardUrl,
  defaultFields,
  parsePair,
  wordCount,
  type CardSpec,
  type EmojiItem,
  type Fields,
  type LeaderboardRow,
  type Stat,
  type Template,
} from "@/lib/card/params";

/**
 * /design: a form that builds an /api/card URL and previews it. The renderer is the API route, so what you
 * see here is byte for byte what the download, the clipboard and the post queue get.
 */
type AllFields = { [T in Template]: Fields[T] };
const FILLABLE: Template[] = ["pair", "leaderboard", "open", "claimed", "bignumber", "token", "airdrop"];
/** Options for "fill from data", mirrored from src/lib/social.ts. */
const METRICS = [
  ["fees", "fees earned"],
  ["volume7d", "volume 7d"],
  ["volume24", "volume 24h"],
  ["mcap", "market cap"],
] as const;
const STATS = [
  ["mover", "biggest mover"],
  ["volume7d", "volume this week"],
  ["volume24", "volume today"],
  ["claims", "combos claimed"],
  ["fees", "creator fees"],
  ["mcap", "combined mcap"],
  ["launches7d", "new pairs 7d"],
  ["drops", "paid in airdrops"],
] as const;
const today = () => new Date().toISOString().slice(0, 10);

export function DesignStudio() {
  const router = useRouter();
  const [template, setTemplate] = useState<Template>("announcement");
  const [size, setSize] = useState(0); // index into SIZES, 1600x900 first
  const [seed, setSeed] = useState(1);
  const [fields, setFields] = useState<AllFields>(() => Object.fromEntries(TEMPLATES.map((t) => [t, defaultFields(t)])) as AllFields);
  const [metric, setMetric] = useState<(typeof METRICS)[number][0]>("fees");
  const [stat, setStat] = useState<(typeof STATS)[number][0]>("mover");
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "busy"; text: string } | null>(null);

  const spec = useMemo<CardSpec>(() => ({ template, w: SIZES[size].w, h: SIZES[size].h, seed: String(seed), fields: fields[template] }), [template, size, seed, fields]);
  const url = useMemo(() => cardUrl(spec), [spec]);

  // Live preview on a 300ms debounce. The previous image stays up until the new one has loaded.
  const [previewUrl, setPreviewUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setPreviewUrl(url);
      setLoading(true);
      setPreviewError(false);
    }, 300);
    return () => clearTimeout(t);
  }, [url]);

  const update = useCallback(<T extends Template>(t: T, patch: Partial<Fields[T]>) => setFields((f) => ({ ...f, [t]: { ...f[t], ...patch } })), []);

  const flash = (kind: "ok" | "err", text: string) => {
    setStatus({ kind, text });
    setTimeout(() => setStatus((s) => (s?.text === text ? null : s)), 2200);
  };

  async function fetchPng(): Promise<Blob> {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error(`render failed (${r.status})`);
    return r.blob();
  }

  async function download() {
    try {
      setStatus({ kind: "busy", text: "rendering…" });
      const blob = await fetchPng();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `moji-${template}-${today()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      flash("ok", `saved ${a.download}`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "download failed");
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      flash("ok", "image URL copied");
    } catch {
      flash("err", "clipboard blocked");
    }
  }

  async function copyImage() {
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("this browser cannot copy images");
      setStatus({ kind: "busy", text: "rendering…" });
      // Pass the promise so Safari keeps the user gesture alive while the PNG renders.
      const item = new ClipboardItem({ "image/png": fetchPng() });
      await navigator.clipboard.write([item]);
      flash("ok", "image copied, paste it into the X composer");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "copy failed");
    }
  }

  async function fillFromData(pair?: { combo: string; ticker: string }) {
    try {
      setStatus({ kind: "busy", text: "reading live data…" });
      const q = new URLSearchParams({ template });
      if (template === "leaderboard") q.set("metric", metric);
      if (template === "bignumber") q.set("stat", stat);
      if (template === "token") {
        q.set("combo", pair?.combo ?? fields.token.combo);
        q.set("ticker", pair?.ticker ?? fields.token.ticker);
      }
      if (template === "airdrop" && pair) {
        q.set("combo", pair.combo);
        q.set("ticker", pair.ticker);
      }
      const r = await fetch(`/api/design/fill?${q}`, { cache: "no-store" });
      if (r.status === 401) return router.refresh();
      const j = (await r.json()) as { fields?: Partial<Fields[Template]>; error?: string };
      if (!r.ok || !j.fields) throw new Error(j.error ?? "fill failed");
      // Never blank a field the data could not supply (no rows yet, Supabase unset): keep what is in the form.
      const patch = Object.fromEntries(Object.entries(j.fields).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== "" && v !== null && v !== undefined)));
      if (!Object.keys(patch).length) return flash("err", "no live data for this template yet");
      update(template, patch as Partial<Fields[Template]>);
      flash("ok", "filled from live data, still editable");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "fill failed");
    }
  }

  const { w, h } = SIZES[size];
  return (
    <div className="grid gap-4 md:grid-cols-[380px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card>
          <Label>template</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Chip key={t} active={template === t} onClick={() => setTemplate(t)}>
                {TEMPLATE_LABEL[t]}
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Label>size</Label>
              <div className="mt-2 flex gap-2">
                {SIZES.map((s, i) => (
                  <Chip key={s.label} active={size === i} onClick={() => setSize(i)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label>scatter</Label>
              <div className="mt-2 flex items-center gap-2">
                <Chip onClick={() => setSeed((s) => s + 1)}>reshuffle</Chip>
                <span className="mono text-[13px] text-ink-soft">seed {seed}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <Label>{TEMPLATE_LABEL[template]}</Label>
            {FILLABLE.includes(template) && (
              <Chip onClick={() => fillFromData()} disabled={status?.kind === "busy"}>
                fill from data
              </Chip>
            )}
          </div>
          {template === "leaderboard" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {METRICS.map(([k, label]) => (
                <Chip key={k} active={metric === k} onClick={() => setMetric(k)}>
                  {label}
                </Chip>
              ))}
            </div>
          )}
          {template === "bignumber" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STATS.map(([k, label]) => (
                <Chip key={k} active={stat === k} onClick={() => setStat(k)}>
                  {label}
                </Chip>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-3">
            <FieldsEditor template={template} fields={fields} update={update} />
          </div>
          {(template === "pair" || template === "token") && (
            <PairPicker
              busy={status?.kind === "busy"}
              onPick={(p) => {
                if (template === "pair") update("pair", { combo: p.combo, ticker: p.ticker });
                else {
                  update("token", { combo: p.combo, ticker: p.ticker });
                  void fillFromData(p);
                }
              }}
            />
          )}
          {template === "airdrop" && (
            <DropPicker
              busy={status?.kind === "busy"}
              onPick={(d) => {
                update("airdrop", d.fields);
                flash("ok", `filled from the ${d.fields.combo} $${d.fields.ticker} airdrop, still editable`);
              }}
            />
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card tone="sky" className="flex flex-col gap-3">
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${w} / ${h}`, borderRadius: "var(--r-sm)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewUrl}
              src={previewUrl}
              width={w}
              height={h}
              alt={`${TEMPLATE_LABEL[template]} preview`}
              className={`block h-full w-full transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setPreviewError(true);
              }}
            />
            {(loading || previewError) && (
              <div className="absolute left-3 top-3">
                <span className={`clay-pill heading px-3 py-1 text-[12px] uppercase tracking-[0.1em] ${previewError ? "bg-coral text-white" : "bg-white text-sky-600"}`}>
                  {previewError ? "render failed" : "rendering…"}
                </span>
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button tone="primary" size="sm" onClick={download} disabled={status?.kind === "busy"}>
              Download PNG
            </Button>
            <Button tone="white" size="sm" onClick={copyUrl}>
              Copy image URL
            </Button>
            <Button tone="white" size="sm" onClick={copyImage} disabled={status?.kind === "busy"}>
              Copy to clipboard
            </Button>
          </div>
          <div className="flex min-h-[18px] items-center justify-between gap-3 text-[12px]">
            <span className={`heading ${status?.kind === "err" ? "text-coral" : status?.kind === "ok" ? "text-mint" : "text-ink-soft"}`}>{status?.text ?? `${w} × ${h} · moji-${template}-${today()}.png`}</span>
          </div>
          <p className="mono break-all text-[11px] leading-snug text-ink-soft">{url}</p>
        </Card>
      </div>
    </div>
  );
}

/** 2 to 4 label / value rows for the stat tiles. */
function StatsEditor({ stats, onChange }: { stats: Stat[]; onChange: (stats: Stat[]) => void }) {
  const set = (i: number, patch: Partial<Stat>) => onChange(stats.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  return (
    <>
      <span className="flex items-center justify-between">
        <Label>stats</Label>
        <span className={`text-[11px] ${stats.length < LIMITS.statsMin || stats.length > LIMITS.statsMax ? "text-coral" : "text-ink-soft"}`}>
          {stats.length} of {LIMITS.statsMin} to {LIMITS.statsMax}
        </span>
      </span>
      {stats.map((st, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2">
          <input className="clay-input" style={inputStyle} value={st.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="label" aria-label={`stat ${i + 1} label`} />
          <input className="clay-input" style={inputStyle} value={st.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="value" aria-label={`stat ${i + 1} value`} />
          <button type="button" className="press clay-pill heading bg-sky-50 text-ink-soft disabled:opacity-40" onClick={() => onChange(stats.filter((_, j) => j !== i))} disabled={stats.length <= 1} aria-label={`remove stat ${i + 1}`}>
            ×
          </button>
        </div>
      ))}
      {stats.length < LIMITS.statsMax && <Chip onClick={() => onChange([...stats, { label: "", value: "" }])}>+ add</Chip>}
    </>
  );
}

type RecentDrop = { id: string; when: string; fields: Fields["airdrop"] };
let dropsCache: RecentDrop[] | null = null;

/** Recent airdrops that paid holders, newest first. One click fills the whole airdrop card. */
function DropPicker({ onPick, busy }: { onPick: (d: RecentDrop) => void; busy?: boolean }) {
  const router = useRouter();
  const [drops, setDrops] = useState<RecentDrop[] | null>(dropsCache);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (dropsCache) return;
    let alive = true;
    fetch("/api/design/airdrops", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return router.refresh();
        const j = (await r.json()) as { airdrops?: RecentDrop[]; error?: string };
        if (!r.ok || !j.airdrops) throw new Error(j.error ?? "could not load airdrops");
        dropsCache = j.airdrops;
        if (alive) setDrops(j.airdrops);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "could not load airdrops"));
    return () => {
      alive = false;
    };
  }, [router]);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <Label>recent airdrops</Label>
        <span className="text-[11px] text-ink-soft">{drops ? `${drops.length} paid out, newest first` : err ?? "loading…"}</span>
      </span>
      <div className="flex max-h-[220px] flex-wrap gap-2 overflow-y-auto scroll-y pb-1">
        {(drops ?? []).map((d) => (
          <Chip key={d.id} onClick={() => onPick(d)} disabled={busy} title={new Date(d.when).toLocaleString()}>
            {d.fields.combo} ${d.fields.ticker} · {d.fields.figure} · {d.fields.stats[0]?.value ?? "?"} holders
          </Chip>
        ))}
        {drops && !drops.length && <span className="text-[12px] text-ink-soft">no airdrops have paid holders yet</span>}
      </div>
    </div>
  );
}

type PairRow = { combo: string; ticker: string; launched_at: string };
let pairsCache: PairRow[] | null = null;

/** Every launched pair as chips, newest first, with a filter box once the list is long. Loaded once per page. */
function PairPicker({ onPick, busy }: { onPick: (p: PairRow) => void; busy?: boolean }) {
  const router = useRouter();
  const [pairs, setPairs] = useState<PairRow[] | null>(pairsCache);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (pairsCache) return;
    let alive = true;
    fetch("/api/design/pairs", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return router.refresh();
        const j = (await r.json()) as { pairs?: PairRow[]; error?: string };
        if (!r.ok || !j.pairs) throw new Error(j.error ?? "could not load pairs");
        pairsCache = j.pairs;
        if (alive) setPairs(j.pairs);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "could not load pairs"));
    return () => {
      alive = false;
    };
  }, [router]);
  const needle = q.trim().toLowerCase();
  const shown = (pairs ?? []).filter((p) => !needle || p.ticker.toLowerCase().includes(needle) || p.combo.includes(needle)).slice(0, 80);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <Label>pairs</Label>
        <span className="text-[11px] text-ink-soft">{pairs ? `${pairs.length} launched, newest first` : err ?? "loading…"}</span>
      </span>
      {pairs && pairs.length > 12 && <input className="clay-input" style={inputStyle} value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter by ticker or emoji" aria-label="filter pairs" />}
      <div className="flex max-h-[220px] flex-wrap gap-2 overflow-y-auto scroll-y pb-1">
        {shown.map((p) => (
          <Chip key={`${p.combo}-${p.ticker}-${p.launched_at}`} onClick={() => onPick(p)} disabled={busy} title={new Date(p.launched_at).toLocaleString()}>
            {p.combo} ${p.ticker}
          </Chip>
        ))}
        {pairs && !shown.length && <span className="text-[12px] text-ink-soft">{pairs.length ? "no match" : "no launches yet"}</span>}
      </div>
    </div>
  );
}

function Chip({ active, children, ...rest }: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button type="button" data-pressed={active ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] disabled:opacity-60 ${active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`} {...rest}>
      {children}
    </button>
  );
}

const inputStyle = { padding: "9px 12px", fontSize: 14 } as const;
function Input({ label, hint, ...rest }: React.ComponentProps<"input"> & { label?: string; hint?: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      {(label || hint) && (
        <span className="flex items-center justify-between gap-2">
          {label && <Label>{label}</Label>}
          {hint && <span className="text-[11px] text-ink-soft">{hint}</span>}
        </span>
      )}
      <input className="clay-input" style={inputStyle} {...rest} />
    </label>
  );
}

function FieldsEditor({ template, fields, update }: { template: Template; fields: AllFields; update: <T extends Template>(t: T, patch: Partial<Fields[T]>) => void }) {
  switch (template) {
    case "announcement": {
      const f = fields.announcement;
      const words = wordCount(f.headline);
      return (
        <>
          <Input
            label="headline"
            value={f.headline}
            onChange={(e) => update("announcement", { headline: e.target.value })}
            hint={<span className={words > LIMITS.headlineWords ? "text-coral" : undefined}>{words}/{LIMITS.headlineWords} words</span>}
          />
          <Input label="subline (optional)" value={f.subline} onChange={(e) => update("announcement", { subline: e.target.value })} />
        </>
      );
    }
    case "pair": {
      const f = fields.pair;
      return (
        <>
          <Input label="combo" value={f.combo} onChange={(e) => update("pair", { combo: e.target.value })} />
          <Input label="ticker" value={f.ticker} onChange={(e) => update("pair", { ticker: e.target.value })} placeholder="AAPL" />
          <Input label="pill label (optional)" value={f.label} onChange={(e) => update("pair", { label: e.target.value })} placeholder="JUST CLAIMED" />
        </>
      );
    }
    case "leaderboard": {
      const f = fields.leaderboard;
      const setRow = (i: number, patch: Partial<LeaderboardRow>) => update("leaderboard", { rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
      return (
        <>
          <Input label="title" value={f.title} onChange={(e) => update("leaderboard", { title: e.target.value })} />
          <Label>rows</Label>
          {f.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[72px_1fr_1fr] gap-2">
              <input className="clay-input" style={inputStyle} value={r.emoji} onChange={(e) => setRow(i, { emoji: e.target.value })} placeholder="🐕" aria-label={`row ${i + 1} emoji`} />
              <input className="clay-input" style={inputStyle} value={r.pair} onChange={(e) => setRow(i, { pair: e.target.value })} placeholder="$NVDA" aria-label={`row ${i + 1} pair`} />
              <input className="clay-input" style={inputStyle} value={r.figure} onChange={(e) => setRow(i, { figure: e.target.value })} placeholder="$4,120" aria-label={`row ${i + 1} figure`} />
            </div>
          ))}
        </>
      );
    }
    case "open": {
      const f = fields.open;
      return (
        <>
          <Input label="title" value={f.title} onChange={(e) => update("open", { title: e.target.value })} />
          <ItemList label="emoji" items={f.items} min={LIMITS.openMin} max={LIMITS.openMax} onChange={(items) => update("open", { items })} tickerHint="label (optional)" />
        </>
      );
    }
    case "claimed": {
      const f = fields.claimed;
      return (
        <>
          <Input label="title" value={f.title} onChange={(e) => update("claimed", { title: e.target.value })} />
          <ItemList label="combos" items={f.tiles} min={LIMITS.claimedMin} max={LIMITS.claimedMax} onChange={(tiles) => update("claimed", { tiles })} tickerHint="ticker" />
          <Input label="count" value={f.count} onChange={(e) => update("claimed", { count: e.target.value })} placeholder="1,842 claimed" />
        </>
      );
    }
    case "bignumber": {
      const f = fields.bignumber;
      return (
        <>
          <Input label="pair" value={f.pair} onChange={(e) => update("bignumber", { pair: e.target.value })} placeholder="🧇 / $TSM" />
          <Input label="figure" value={f.figure} onChange={(e) => update("bignumber", { figure: e.target.value })} placeholder="+340%" />
          <Input label="label" value={f.label} onChange={(e) => update("bignumber", { label: e.target.value })} placeholder="this week" />
        </>
      );
    }
    case "airdrop": {
      const f = fields.airdrop;
      return (
        <>
          <Input label="pair" hint="pick an airdrop below, or type 🪟 / MSFT and fill from data" value={`${f.combo}${f.ticker ? ` / ${f.ticker}` : ""}`} onChange={(e) => update("airdrop", parsePair(e.target.value))} placeholder="🪟 / MSFT" />
          <Input label="pill label (optional)" value={f.label} onChange={(e) => update("airdrop", { label: e.target.value })} placeholder="🪂 AIRDROP" />
          <Input label="figure" value={f.figure} onChange={(e) => update("airdrop", { figure: e.target.value })} placeholder="$1,240" />
          <Input label="summary line (optional)" value={f.sub} onChange={(e) => update("airdrop", { sub: e.target.value })} placeholder="0.5 $MSFT airdropped to 100 holders · Sep 14" />
          <StatsEditor stats={f.stats} onChange={(stats) => update("airdrop", { stats })} />
        </>
      );
    }
    case "token": {
      const f = fields.token;
      const setStat = (i: number, patch: Partial<Stat>) => update("token", { stats: f.stats.map((st, j) => (j === i ? { ...st, ...patch } : st)) });
      return (
        <>
          <Input
            label="pair"
            hint="type it like 🪟 / MSFT, then fill from data"
            value={`${f.combo}${f.ticker ? ` / ${f.ticker}` : ""}`}
            onChange={(e) => update("token", parsePair(e.target.value))}
            placeholder="🪟 / MSFT"
          />
          <Input label="creator line (optional)" value={f.creator} onChange={(e) => update("token", { creator: e.target.value })} placeholder="launched by @handle · 3 days ago" />
          <span className="flex items-center justify-between">
            <Label>stats</Label>
            <span className={`text-[11px] ${f.stats.length < LIMITS.statsMin || f.stats.length > LIMITS.statsMax ? "text-coral" : "text-ink-soft"}`}>
              {f.stats.length} of {LIMITS.statsMin} to {LIMITS.statsMax}
            </span>
          </span>
          {f.stats.map((st, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2">
              <input className="clay-input" style={inputStyle} value={st.label} onChange={(e) => setStat(i, { label: e.target.value })} placeholder="market cap" aria-label={`stat ${i + 1} label`} />
              <input className="clay-input" style={inputStyle} value={st.value} onChange={(e) => setStat(i, { value: e.target.value })} placeholder="$184K" aria-label={`stat ${i + 1} value`} />
              <button type="button" className="press clay-pill heading bg-sky-50 text-ink-soft disabled:opacity-40" onClick={() => update("token", { stats: f.stats.filter((_, j) => j !== i) })} disabled={f.stats.length <= 1} aria-label={`remove stat ${i + 1}`}>
                ×
              </button>
            </div>
          ))}
          {f.stats.length < LIMITS.statsMax && <Chip onClick={() => update("token", { stats: [...f.stats, { label: "", value: "" }] })}>+ add</Chip>}
        </>
      );
    }
  }
}

function ItemList({ label, items, min, max, onChange, tickerHint }: { label: string; items: EmojiItem[]; min: number; max: number; onChange: (items: EmojiItem[]) => void; tickerHint: string }) {
  const set = (i: number, patch: Partial<EmojiItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const lastEmoji = useRef<HTMLInputElement>(null);
  const [focusLast, setFocusLast] = useState(false);
  useEffect(() => {
    if (focusLast) {
      lastEmoji.current?.focus();
      setFocusLast(false);
    }
  }, [focusLast, items.length]);
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className={`text-[11px] ${items.length < min || items.length > max ? "text-coral" : "text-ink-soft"}`}>
          {items.length} of {min} to {max}
        </span>
      </span>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[72px_1fr_36px] gap-2">
          <input ref={i === items.length - 1 ? lastEmoji : undefined} className="clay-input" style={inputStyle} value={it.emoji} onChange={(e) => set(i, { emoji: e.target.value })} placeholder="🦖" aria-label={`item ${i + 1} emoji`} />
          <input className="clay-input" style={inputStyle} value={it.ticker} onChange={(e) => set(i, { ticker: e.target.value })} placeholder={tickerHint} aria-label={`item ${i + 1} ${tickerHint}`} />
          <button type="button" className="press clay-pill heading bg-sky-50 text-ink-soft disabled:opacity-40" onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length <= 1} aria-label={`remove item ${i + 1}`}>
            ×
          </button>
        </div>
      ))}
      {items.length < max && (
        <Chip
          onClick={() => {
            onChange([...items, { emoji: "", ticker: "" }]);
            setFocusLast(true);
          }}
        >
          + add
        </Chip>
      )}
    </div>
  );
}
