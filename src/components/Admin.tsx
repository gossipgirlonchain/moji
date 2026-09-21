"use client";

import { deleteMeme } from "@/lib/meme-client";
import Link from "next/link";
import { mojiHref } from "@/components/MojiBits";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import type { MojiRow } from "@/lib/supabase";
import type { MojiFees } from "@/lib/fees";
import type { Market } from "@/lib/market";
import { MOJI_TREASURY } from "@/config/fees";
import { DEFAULT_CHAIN } from "@/config/chains";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { short, usd } from "@/lib/format";
import { explorerAddress } from "@/lib/links";
import { Button, Card, Label } from "./ui";
import { CopyButton } from "./CopyButton";
import { ClaimButton } from "./FeesCard";
import { useWallets } from "@privy-io/react-auth";
import { claimPool } from "@/lib/claim-client";
import type { Address } from "viem";

export function AdminGate() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (!r.ok) return setErr("Wrong password");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="clay pop flex flex-col gap-3 bg-white p-5">
      <Label>Password</Label>
      <input className="clay-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
      <Button disabled={busy || !pw}>{busy ? "…" : "Enter"}</Button>
      {err && <p className="text-center text-[13px] text-coral">{err}</p>}
    </form>
  );
}

type Pool = MojiRow & { fees: MojiFees; creatorFees: MojiFees; market: Market };
type Bucket = { stockUsd: number; mojiUsd: number; totalUsd?: number; claimable?: number; count?: number };
type Stats = {
  pools: number; combosClaimed: number; launches24h: number; launches7d: number; uniqueCreators: number; withX: number;
  totalMcap: number; volume24: number; volume6h: number; volume1h: number; txns24: number; volumeAll: number; txnsAll: number; liquidity: number; decaying: number; distinctStocks: number;
  launchesPerDay: { day: string; n: number }[];
  stocks: { ticker: string; count: number; mcap: number; volume24: number }[];
  top: { mcap: TopRow[]; volume: TopRow[]; volumeAll: TopRow[]; treasury: TopRow[] };
  treasury: Bucket; creators: Bucket; claimed: { treasury: Bucket; creator: Bucket };
  recentClaims: { role: string; combo: string; stock_ticker: string | null; stock_amount: number; moji_amount: number; stock_usd: number; moji_usd: number; created_at: string }[];
  windows: Record<WindowKey, WindowStats>;
};
type TopRow = { display: string; ticker: string; v: number };
type WindowStats = { launches: number; creators: number; withX: number; stocks: number; volume: number; txns: number; topVolume: TopRow[]; claimed: { treasury: Bucket; creator: Bucket } };
type WindowKey = "24h" | "7d" | "30d" | "all";
type Payload = { treasury: string; pools: Pool[]; stats: Stats };
const [tabs] = [["treasury", "stats", "pools"] as const];
type Tab = (typeof tabs)[number];

function fmt(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("treasury");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/pools", { cache: "no-store" });
      if (r.status === 401) return router.refresh();
      const j = (await r.json()) as Payload & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "failed");
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [router]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center gap-2">
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} data-pressed={tab === t ? "true" : undefined} className={`press clay-pill heading px-4 py-2 text-[14px] ${tab === t ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
            {t}
          </button>
        ))}
      </div>
      {err && <p className="text-center text-[13px] text-coral">{err}</p>}
      {!data ? (
        <p className="text-center text-[14px] text-ink-soft">reading every pool…</p>
      ) : tab === "stats" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <StatsView s={data.stats} />
        </div>
      ) : tab === "pools" ? (
        <PoolsView pools={data.pools} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <TreasuryView data={data} reload={load} />
        </div>
      )}
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

function Tile({ v, k, tone = "ink" }: { v: string; k: string; tone?: "ink" | "mint" | "coral" }) {
  const c = { ink: "text-ink", mint: "text-mint", coral: "text-coral" }[tone];
  return (
    <div className="clay-sm bg-white px-3 py-3 text-center">
      <div className={`num text-[22px] leading-none ${c}`}>{v}</div>
      <div className="heading mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">{k}</div>
    </div>
  );
}

function Split({ title, b, hint }: { title: string; b: Bucket; hint?: string }) {
  const total = b.totalUsd ?? b.stockUsd + b.mojiUsd;
  const pct = total > 0 ? Math.round((b.stockUsd / total) * 100) : 0;
  return (
    <Card tone="sky">
      <div className="flex items-baseline justify-between">
        <Label>{title}</Label>
        <span className="num text-[22px] text-mint">{usd(total)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="clay-sm bg-white px-3 py-3 text-center">
          <div className="num text-[22px] leading-none text-ink">{usd(b.stockUsd)}</div>
          <div className="heading mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">in stock tokens</div>
        </div>
        <div className="clay-sm bg-white px-3 py-3 text-center">
          <div className="num text-[22px] leading-none text-ink-soft">{usd(b.mojiUsd)}</div>
          <div className="heading mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">in moji tokens</div>
        </div>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden bg-white" style={{ borderRadius: 999, boxShadow: "var(--clay-press)" }}>
        <div className="h-full bg-mint" style={{ width: `${pct}%`, borderRadius: 999 }} />
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        {pct}% real stock value · {100 - pct}% moji tokens (illiquid, priced at spot){hint ? ` · ${hint}` : ""}
      </p>
    </Card>
  );
}

function ClaimAll({ pools, onDone }: { pools: Pool[]; onDone: () => void }) {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase());
  const isTreasury = Boolean(address && MOJI_TREASURY && address.toLowerCase() === MOJI_TREASURY.toLowerCase());
  const [running, setRunning] = useState(false);
  const stopReq = useRef(false); // ref: the loop reads it while a state update would be stale
  const [progress, setProgress] = useState<string | null>(null);
  const [log, setLog] = useState<{ combo: string; ok: boolean; note: string }[]>([]);
  const MIN_USD = 1;

  const targets = pools
    .filter((p) => (p.fees.sources.pool && p.fees.pendingStockUsd + p.fees.pendingMojiUsd >= MIN_USD) || p.fees.sources.hook)
    .sort((a, b) => b.fees.pendingUsd - a.fees.pendingUsd);
  const worth = targets.filter((p) => p.fees.pendingUsd >= MIN_USD);

  async function run() {
    if (!wallet || !address) return;
    setRunning(true);
    stopReq.current = false;
    setLog([]);
    let i = 0;
    for (const p of worth) {
      if (stopReq.current) break;
      i++;
      try {
        const usdPool = p.fees.bySource ? p.fees.bySource.pool.stock * (p.market.stockPriceUsd || 0) + p.fees.bySource.pool.moji * (p.market.priceUsd || 0) : Infinity;
        const usdHook = p.fees.bySource ? p.fees.bySource.hook.stock * (p.market.stockPriceUsd || 0) + p.fees.bySource.hook.moji * (p.market.priceUsd || 0) : Infinity;
        const r = await claimPool(
          { combo: p.display, chainId: p.chain_id, tokenAddress: p.token_address!, poolId: p.pool_id, sources: p.fees.sources, bySource: p.fees.bySource, usd: { pool: usdPool, hook: usdHook } },
          wallet,
          address as Address,
          { minUsd: MIN_USD, onStep: (k, n, step) => setProgress(`${p.display} · pool ${i} of ${worth.length} · sign ${k} of ${n}: ${step.label}`) },
        );
        setLog((l) => [{ combo: p.display, ok: true, note: r.skipped ? "skipped (dust)" : `${r.hashes.length} tx` }, ...l]);
      } catch (e) {
        const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
        const cancelled = /rejected|denied|cancel/i.test(msg);
        setLog((l) => [{ combo: p.display, ok: false, note: cancelled ? "cancelled" : msg.split("\n")[0].slice(0, 80) }, ...l]);
        if (cancelled) {
          // one cancel = stop the run; the user can restart and it will pick up what is left
          break;
        }
      }
    }
    setProgress(null);
    setRunning(false);
    onDone();
  }

  if (!isTreasury) return null;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Label>Claim all</Label>
        <span className="text-[12px] text-ink-soft">{worth.length} pools ≥ ${MIN_USD} · up to {worth.length * 2} signatures</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={run} disabled={running || !wallet || worth.length === 0}>
          {running ? progress ?? "starting…" : worth.length ? `Claim all (${worth.length})` : "nothing to claim"}
        </Button>
        {running && (
          <button type="button" onClick={() => { stopReq.current = true; }} className="press clay-sm heading shrink-0 bg-white px-4 text-[14px] text-ink">
            stop
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        biggest first, two signatures per pool, sub-$1 sources skipped. cancelling a signature stops the run; tap again to continue with what&apos;s left.
      </p>
      {log.length > 0 && (
        <div className="mt-3 flex max-h-[180px] flex-col gap-1 overflow-y-auto text-[12px]">
          {log.map((l, i) => (
            <div key={i} className="flex justify-between">
              <span>{l.combo}</span>
              <span className={l.ok ? "text-mint" : "text-coral"}>{l.note}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TreasuryView({ data, reload }: { data: Payload; reload: () => void }) {
  const s = data.stats;
  return (
    <>
      <TreasuryWallet />
      <Split title="Treasury unclaimed" b={s.treasury} hint={`${s.treasury.claimable} pools to claim`} />
      <ClaimAll pools={data.pools} onDone={reload} />
      <Split title="Treasury claimed" b={s.claimed.treasury} hint={`${s.claimed.treasury.count} claims recorded`} />
      {data.pools
        .filter((p) => p.fees.sources.pool || p.fees.sources.hook)
        .sort((a, b) => b.fees.pendingUsd - a.fees.pendingUsd)
        .map((p, i) => (
          <PoolRow key={p.id} p={p} i={i} claim />
        ))}
      {s.treasury.claimable === 0 && <p className="text-center text-[13px] text-ink-soft">nothing to claim right now.</p>}
    </>
  );
}

function PoolsView({ pools }: { pools: Pool[] }) {
  const [sort, setSort] = useState<"mcap" | "vol24" | "volAll" | "treasury" | "newest">("mcap");
  const sorted = [...pools].sort((a, b) =>
    sort === "mcap" ? b.market.marketCapUsd - a.market.marketCapUsd
    : sort === "vol24" ? b.market.volume24Usd - a.market.volume24Usd
    : sort === "volAll" ? Number(b.volume_all_usd ?? 0) - Number(a.volume_all_usd ?? 0)
    : sort === "treasury" ? b.fees.pendingUsd - a.fees.pendingUsd
    : new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime(),
  );
  const th = "heading px-3 py-2 text-left text-[11px] uppercase tracking-[0.1em] text-ink-soft";
  const td = "px-3 py-2 text-[13px] whitespace-nowrap";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {([["mcap", "market cap"], ["volAll", "volume all time"], ["vol24", "volume 24h"], ["treasury", "treasury pending"], ["newest", "newest"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setSort(k)} data-pressed={sort === k ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${sort === k ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
            {l}
          </button>
        ))}
      </div>
      {/* desktop: table */}
      <div className="clay hidden overflow-x-auto bg-white p-2 md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>moji</th><th className={th}>chain</th><th className={th}>mcap</th><th className={th}>vol all</th><th className={th}>vol 24h</th><th className={th}>trades</th><th className={th}>treasury pending</th><th className={th}>creator pending</th><th className={th}>by</th><th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-t border-sky-100">
                <td className={td}>
                  <Link href={mojiHref(p)} className="heading text-[15px] text-ink">{p.display} / {p.stock_ticker}</Link>
                  {p.meme_url && <MemeTakedown m={p} />}
                </td>
                <td className={`${td} text-ink-soft`}>{p.chain_id}</td>
                <td className={`${td} num`}>{usd(p.market.marketCapUsd)}</td>
                <td className={`${td} num`}>{usd(Number(p.volume_all_usd ?? 0))}</td>
                <td className={`${td} num`}>{usd(p.market.volume24Usd)}</td>
                <td className={`${td} num text-ink-soft`}>{Number(p.txns_all ?? 0).toLocaleString()}</td>
                <td className={`${td} num text-mint`}>{fmt(p.fees.pending.stock)} {p.stock_ticker} · {fmt(p.fees.pending.moji)} {p.display}<span className="text-ink-soft"> ≈ {usd(p.fees.pendingUsd)}</span></td>
                <td className={`${td} num text-ink-soft`}>{fmt(p.creatorFees.pending.stock)} {p.stock_ticker}</td>
                <td className={`${td} text-ink-soft`}>{p.creator_handle ? `@${p.creator_handle}` : short(p.creator_address)}</td>
                <td className={td}>
                  <div className="w-[120px]">
                    <ClaimButton compact beneficiary={MOJI_TREASURY} combo={p.display} ticker={p.stock_ticker} chainId={p.chain_id} tokenAddress={p.token_address} poolId={p.pool_id} creatorAddress={p.creator_address} pending={p.fees.pending} pendingUsd={p.fees.pendingUsd} pendingStockUsd={p.fees.pendingStockUsd} pendingMojiUsd={p.fees.pendingMojiUsd} claimedUsd={0} sources={p.fees.sources} bySource={p.fees.bySource} schedule={p.fees.schedule} live={p.fees.live} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* mobile: cards */}
      <div className="flex flex-col gap-4 md:hidden">
        {sorted.map((p, i) => (
          <PoolRow key={p.id} p={p} i={i} claim />
        ))}
      </div>
    </>
  );
}

function PoolRow({ p, i, claim }: { p: Pool; i: number; claim?: boolean }) {
  return (
    <section className={`clay pop pop-${Math.min(5, (i % 5) + 1)} bg-white p-4`}>
      <div className="flex items-center gap-3">
        <Link href={mojiHref(p)} className="text-[34px] leading-none">
          {p.display}
        </Link>
        <div className="flex-1">
          <Link href={mojiHref(p)} className="heading block text-[16px] text-ink">
            {p.display} / {p.stock_ticker}
          </Link>
          <div className="text-[12px] text-ink-soft">
            mcap {usd(p.market.marketCapUsd)} · vol 24h {usd(p.market.volume24Usd)} · all {usd(Number(p.volume_all_usd ?? 0))} · by {p.creator_handle ? `@${p.creator_handle}` : short(p.creator_address)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="clay-sm bg-sky-50 px-3 py-2.5 text-center">
          <div className="num text-[20px] leading-none text-mint">{fmt(p.fees.pending.stock)}</div>
          <div className="heading mt-1 text-[11px] text-ink">{p.stock_ticker} <span className="text-ink-soft">≈ {usd(p.fees.pendingStockUsd)}</span></div>
        </div>
        <div className="clay-sm bg-sky-50 px-3 py-2.5 text-center">
          <div className="num text-[20px] leading-none text-mint">{fmt(p.fees.pending.moji)}</div>
          <div className="heading mt-1 text-[11px] text-ink">{p.display} <span className="text-ink-soft">≈ {usd(p.fees.pendingMojiUsd)}</span></div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        treasury share above · creator has {fmt(p.creatorFees.pending.stock)} {p.stock_ticker} + {fmt(p.creatorFees.pending.moji)} {p.display} unclaimed
      </p>
      {p.fees.error && <p className="mt-1 text-center text-[11px] text-coral">read failed, retrying</p>}
      {claim && (
        <div className="mt-3">
          <ClaimButton
            compact
            beneficiary={MOJI_TREASURY}
            combo={p.display}
            ticker={p.stock_ticker}
            chainId={p.chain_id}
            tokenAddress={p.token_address}
            poolId={p.pool_id}
            creatorAddress={p.creator_address}
            pending={p.fees.pending}
            pendingUsd={p.fees.pendingUsd}
            pendingStockUsd={p.fees.pendingStockUsd}
            pendingMojiUsd={p.fees.pendingMojiUsd}
            claimedUsd={0}
            sources={p.fees.sources}
            bySource={p.fees.bySource}
            schedule={p.fees.schedule}
            live={p.fees.live}
          />
        </div>
      )}
    </section>
  );
}

function StatsView({ s }: { s: Stats }) {
  const [w, setW] = useState<WindowKey>("24h");
  const ws = s.windows[w];
  const label = w === "all" ? "all time" : `last ${w}`;
  const max = Math.max(1, ...s.launchesPerDay.map((d) => d.n));
  const Top = ({ title, rows }: { title: string; rows: TopRow[] }) => (
    <Card>
      <Label className="mb-2">{title}</Label>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <Link key={r.display + i} href={`/m/${encodeURIComponent(r.display)}`} className="flex items-center justify-between text-[14px]">
            <span className="heading text-ink">
              <span className="mr-2 text-ink-soft">{i + 1}</span>
              {r.display} / {r.ticker}
            </span>
            <span className="num text-mint">{usd(r.v)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
  return (
    <>
      <div className="flex justify-center gap-2 md:col-span-2">
        {(["24h", "7d", "30d", "all"] as WindowKey[]).map((k) => (
          <button key={k} type="button" onClick={() => setW(k)} data-pressed={w === k ? "true" : undefined} className={`press clay-pill heading px-4 py-2 text-[14px] ${w === k ? "bg-sky-500 text-white" : "bg-white text-ink"}`}>
            {k === "all" ? "all time" : k}
          </button>
        ))}
      </div>
      <Card tone="sky">
        <Label className="mb-3">Launches · {label}</Label>
        <div className="grid grid-cols-3 gap-2">
          <Tile v={String(ws.launches)} k={`launched · ${label}`} />
          <Tile v={String(ws.creators)} k="creators" />
          <Tile v={String(ws.withX)} k="with X linked" />
          <Tile v={String(ws.stocks)} k="stocks used" />
          <Tile v={String(s.pools)} k="live pools (now)" />
          <Tile v={String(s.combosClaimed)} k="combos claimed (now)" />
        </div>
        <div className="mt-4 flex h-[72px] items-end gap-1">
          {s.launchesPerDay.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.n}`}>
              <div className="w-full bg-sky-500" style={{ height: `${Math.max(3, (d.n / max) * 60)}px`, borderRadius: 999 }} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-ink-soft">launches per day · last 14 days</p>
      </Card>

      <Card tone="sky">
        <Label className="mb-3">Markets · {label} (rolling)</Label>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
          <Tile v={usd(ws.volume)} k={`volume · ${label}`} tone="mint" />
          <Tile v={ws.txns.toLocaleString()} k={`trades · ${label}`} />
          <Tile v={usd(s.totalMcap)} k="total mcap (now)" />
          <Tile v={usd(s.liquidity)} k="liquidity (now)" />
          <Tile v={usd(s.volume6h)} k="volume 6h" />
          <Tile v={usd(s.volume1h)} k="volume 1h" />
          <Tile v={usd(s.volumeAll)} k="volume all time" />
          <Tile v={s.txnsAll.toLocaleString()} k="trades all time" />
        </div>
      </Card>

      <Split title="Treasury unclaimed (now)" b={s.treasury} />
      <Split title="Creators unclaimed (now, all pools)" b={s.creators} />
      <Split title={`Treasury claimed · ${label}`} b={ws.claimed.treasury} hint={`${ws.claimed.treasury.count} claims`} />
      <Split title={`Creators claimed · ${label}`} b={ws.claimed.creator} hint={`${ws.claimed.creator.count} claims`} />

      <div className="grid gap-4 md:grid-cols-2">
        <Top title="Top by market cap" rows={s.top.mcap} />
        <Top title={`Top by volume · ${label}`} rows={ws.topVolume} />
        <Top title="Top by all-time volume" rows={s.top.volumeAll} />
        <Top title="Top treasury earners" rows={s.top.treasury} />
      </div>

      <Card>
        <Label className="mb-2">Pools by stock</Label>
        <div className="flex flex-col gap-1.5">
          {s.stocks.map((r) => (
            <div key={r.ticker} className="flex items-center justify-between text-[14px]">
              <span className="heading text-ink">{r.ticker}</span>
              <span className="text-ink-soft">
                {r.count} {r.count === 1 ? "pool" : "pools"} · mcap <span className="num text-ink">{usd(r.mcap)}</span> · vol24 <span className="num text-ink">{usd(r.volume24)}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {s.recentClaims.length > 0 && (
        <Card>
          <Label className="mb-2">Recent claims</Label>
          <div className="flex flex-col gap-1.5">
            {s.recentClaims.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[13px]">
                <span className="text-ink">
                  <span className="heading">{c.role}</span> · {c.combo} / {c.stock_ticker}
                </span>
                <span className="num text-ink-soft">
                  {fmt(Number(c.stock_amount))} {c.stock_ticker} + {fmt(Number(c.moji_amount))} {c.combo}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function TreasuryWallet() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const isTreasury = Boolean(address && MOJI_TREASURY && address.toLowerCase() === MOJI_TREASURY.toLowerCase());
  if (!PRIVY_ENABLED) return null;
  return (
    <Card pop={0}>
      <Label>Treasury wallet</Label>
      <div className="mt-1 flex items-center justify-between gap-2">
        <a href={explorerAddress(DEFAULT_CHAIN.chainId, MOJI_TREASURY)} target="_blank" rel="noopener noreferrer" className="mono text-[13px] text-sky-600">
          {short(MOJI_TREASURY, 8, 6)}
        </a>
        <CopyButton text={MOJI_TREASURY} />
      </div>
      <div className="mt-3">
        {!ready ? null : !authenticated ? (
          <Button onClick={login}>Connect treasury wallet</Button>
        ) : isTreasury ? (
          <p className="heading text-center text-[14px] text-mint">● treasury connected. Claim buttons below are live.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-[13px] text-coral">connected as {short(address ?? "")}, not the treasury. log out and connect {short(MOJI_TREASURY)}.</p>
            <Button tone="outline" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Admin takedown for a creator meme (DELETE /api/mojis/[combo]/meme with the admin cookie). */
function MemeTakedown({ m }: { m: Pick<MojiRow, "display" | "chain_id" | "stock_address" | "meme_url"> }) {
  const [state, setState] = useState<"idle" | "busy" | "gone" | "error">("idle");
  if (state === "gone") return <span className="ml-2 text-[11px] text-ink-soft">meme removed</span>;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      title="remove the creator's meme"
      onClick={async () => {
        if (!confirm(`Remove the meme on ${m.display}?`)) return;
        setState("busy");
        try {
          await deleteMeme({ combo: m.display, chainId: m.chain_id, pair: m.stock_address }, null);
          setState("gone");
        } catch {
          setState("error");
        }
      }}
      className="press clay-pill heading ml-2 bg-coral px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-white disabled:opacity-60"
    >
      {state === "error" ? "retry meme ✕" : "meme ✕"}
    </button>
  );
}
