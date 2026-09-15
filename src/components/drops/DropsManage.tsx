"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { transportFor } from "@/lib/rpc";
import { ensureChain, pickWallet } from "@/lib/wallet";
import { chainById } from "@/config/chains";
import { explorerTx, explorerAddress } from "@/lib/links";
import { usd, short, dateShort } from "@/lib/format";
import { Label, Pill } from "@/components/ui";
import { ERC20_MIN_ABI } from "@/lib/drops/contract";
import { canonicalRulesMessage, type DropRow, type DropRules, type PayoutRow, type Split, type TokenKind } from "@/lib/drops/types";

export type ManageProps = {
  combo: string;
  ticker: string;
  chainId: number;
  stockAddress: string;
  stockDecimals: number;
  tokenAddress: string | null;
  creatorAddress: string | null;
  mojiId: string;
  stats: { marketCapUsd: number; priceUsd: number; volume24Usd: number; volumeAllUsd: number; feesClaimedUsd: number; feesUnclaimedUsd: number; feeCurrent: number | null; holders: number; launchedAt: string; dropsPaidUsd: number };
};

type Summary = {
  holders: number;
  top10Bps: number;
  poolBps: number;
  median: string;
  buckets: { label: string; count: number }[];
  top: { address: string; balance: string; heldSince: string | null }[];
  scannedAt: string | null;
};

type Preview = {
  toHolders: string;
  feeBps: number;
  fee: string;
  total: string;
  tokenPriceUsd: number;
  eligible: number;
  paid: number;
  belowFloor: number;
  thresholdMoji: string | null;
  medianUsd: number;
  minUsd: number;
  maxUsd: number;
  top: { address: string; rank: number; held: string; amount: string; usd: number }[];
  token: { symbol: string; decimals: number };
  error?: string;
};

type DropsView = { drops: DropRow[]; latestPayouts: PayoutRow[]; feeBps: number; feeRecipient: string | null };

function fmtTok(n: number | string, max = 4): string {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "0";
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  if (v < 0.0001) return v.toExponential(2);
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function DropsManage(p: ManageProps) {
  const [tab, setTab] = useState<"stats" | "drops">("drops");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Pill active={tab === "drops"} onClick={() => setTab("drops")}>
          drops
        </Pill>
        <Pill active={tab === "stats"} onClick={() => setTab("stats")}>
          stats
        </Pill>
      </div>
      {tab === "stats" ? <StatsTab {...p} /> : <DropsTab {...p} />}
    </div>
  );
}

/* ───────────────────────── stats ───────────────────────── */

function StatsTab(p: ManageProps) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/mojis/${encodeURIComponent(p.combo)}/holders?chain=${p.chainId}&pair=${p.stockAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { summary?: Summary; scanError?: string; error?: string }) => {
        if (!alive) return;
        if (j.summary) setSum(j.summary);
        if (j.scanError || j.error) setErr(j.scanError ?? j.error ?? null);
      })
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [p.combo, p.chainId, p.stockAddress]);
  const s = p.stats;
  const maxBucket = Math.max(1, ...(sum?.buckets.map((b) => b.count) ?? [1]));
  return (
    <div className="flex flex-col gap-3">
      <section className="clay pop pop-1 bg-white p-4">
        <Label className="mb-2">Market</Label>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="mcap" value={usd(s.marketCapUsd)} />
          <Stat label="price" value={usd(s.priceUsd)} />
          <Stat label="vol 24h" value={usd(s.volume24Usd)} />
        </div>
      </section>
      <section className="clay pop pop-2 bg-white p-4">
        <Label className="mb-2">Fees · your 70%</Label>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="earned" value={usd(s.feesClaimedUsd + s.feesUnclaimedUsd)} tone="mint" />
          <Stat label="unclaimed" value={usd(s.feesUnclaimedUsd)} />
          <Stat label="fee now" value={s.feeCurrent != null ? `${(s.feeCurrent / 10_000).toFixed(1)}%` : "—"} />
        </div>
        <p className="mt-2 text-[12px] text-ink-soft">all-time volume {usd(s.volumeAllUsd)} · launched {dateShort(s.launchedAt)}</p>
      </section>
      <section className="clay pop pop-3 bg-white p-4">
        <div className="flex items-center justify-between">
          <Label>Holders</Label>
          {sum?.scannedAt && <span className="text-[11px] text-ink-soft">scanned {new Date(sum.scannedAt).toLocaleTimeString()}</span>}
        </div>
        {!sum && !err && <p className="mt-2 text-[13px] text-ink-soft">reading transfer logs…</p>}
        {err && <p className="mt-2 text-[12px] text-coral">{err}</p>}
        {sum && (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Stat label="holders" value={String(sum.holders)} />
              <Stat label="top 10 hold" value={`${(sum.top10Bps / 100).toFixed(1)}%`} />
              <Stat label="in pool" value={`${(sum.poolBps / 100).toFixed(1)}%`} />
            </div>
            <p className="mt-2 text-[12px] text-ink-soft">median holder {fmtTok(formatUnits(BigInt(sum.median), 18), 0)} {p.combo} · dropped to holders so far {usd(s.dropsPaidUsd)}</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {sum.buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-[12px]">
                  <span className="w-[72px] shrink-0 text-ink-soft">{b.label}</span>
                  <span className="h-3 rounded-full bg-sky-400" style={{ width: `${Math.max(2, (b.count / maxBucket) * 100)}%` }} />
                  <span className="num text-ink">{b.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {sum.top.slice(0, 10).map((h, i) => (
                <div key={h.address} className="flex items-center gap-2 text-[12px]">
                  <span className="w-5 text-ink-soft">{i + 1}</span>
                  <a href={explorerAddress(p.chainId, h.address)} target="_blank" rel="noopener noreferrer" className="mono text-sky-600">
                    {short(h.address, 6, 4)}
                  </a>
                  <span className="flex-1 text-right num text-ink">{fmtTok(formatUnits(BigInt(h.balance), 18), 0)}</span>
                  <span className="w-[72px] text-right text-ink-soft">{h.heldSince ? `since ${dateShort(h.heldSince)}` : ""}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "mint" }) {
  return (
    <div className="clay-sm bg-sky-50 px-2 py-2.5 text-center">
      <div className={`num text-[18px] leading-none ${tone === "mint" ? "text-mint" : "text-ink"}`}>{value}</div>
      <div className="heading mt-1 text-[10px] uppercase tracking-[0.1em] text-ink-soft">{label}</div>
    </div>
  );
}

/* ───────────────────────── drops ───────────────────────── */

const DEFAULTS = { token: "stock" as TokenKind, amount: "", topN: "20", holdDays: "0", minHold: "0", minPayoutUsd: "2", split: "prorata" as Split, maxPct: "5", excluded: "" };

/** Big labelled input. Own styling (not .clay-input) so widths come from the grid, never from the class. */
function Field({ label, unit, hint, value, onChange, disabled, mode = "decimal", children }: { label: string; unit?: string; hint?: string; value?: string; onChange?: (v: string) => void; disabled?: boolean; mode?: "decimal" | "numeric"; children?: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="heading pl-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">{label}</span>
      <span className="flex min-w-0 items-center gap-2 rounded-[20px] bg-sky-50 px-4 py-3" style={{ boxShadow: "var(--clay-press)" }}>
        {children ?? (
          <input className="num min-w-0 flex-1 bg-transparent text-[22px] font-extrabold leading-none text-ink outline-none placeholder:text-sky-300" inputMode={mode} placeholder="0" value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled} />
        )}
        {unit && <span className="heading shrink-0 text-[13px] text-ink-soft">{unit}</span>}
      </span>
      {hint && <span className="num pl-1 text-[12px] text-ink-soft">{hint}</span>}
    </label>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "mint" }) {
  return (
    <div className="clay-sm flex flex-col gap-0.5 bg-white px-4 py-3">
      <span className="heading text-[10px] uppercase tracking-[0.12em] text-ink-soft">{label}</span>
      <span className={`num text-[20px] leading-tight ${tone === "mint" ? "text-mint" : "text-ink"}`}>{value}</span>
      {sub && <span className="text-[11px] text-ink-soft">{sub}</span>}
    </div>
  );
}

function DropsTab(p: ManageProps) {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const wallet = useMemo(() => wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase()) ?? pickWallet(wallets), [wallets, address]);
  const isCreator = Boolean(address && p.creatorAddress && address.toLowerCase() === p.creatorAddress.toLowerCase());
  const chain = chainById(p.chainId);

  const [f, setF] = useState(DEFAULTS);
  const [more, setMore] = useState(false);
  const [view, setView] = useState<DropsView | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [balances, setBalances] = useState<{ stock: bigint; moji: bigint } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** the drop being sent right now (or resumed) */
  const [active, setActive] = useState<{ drop: DropRow; payouts: PayoutRow[] } | null>(null);
  const running = useRef(false);
  const stop = useRef(false);

  const tokenAddr = (f.token === "moji" ? p.tokenAddress : p.stockAddress) as Address | null;
  const decimals = f.token === "moji" ? 18 : p.stockDecimals;
  const symbol = f.token === "moji" ? p.combo : p.ticker;
  const balance = balances ? (f.token === "moji" ? balances.moji : balances.stock) : null;
  const amountWei = useMemo(() => {
    try {
      return parseUnits(f.amount || "0", decimals);
    } catch {
      return null;
    }
  }, [f.amount, decimals]);
  const feeBps = preview?.feeBps ?? view?.feeBps ?? 50;
  const totalWei = amountWei != null ? amountWei + (amountWei * BigInt(feeBps)) / 10_000n : null;
  const overBalance = balance != null && totalWei != null && totalWei > balance;
  const capBps = Math.round(Math.min(100, Math.max(0, Number(f.maxPct) || 0)) * 100);
  const [stockPrice, setStockPrice] = useState<number>(0);
  useEffect(() => {
    fetch(`/api/price?ticker=${encodeURIComponent(p.ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { price?: number } | null) => j && setStockPrice(Number(j.price ?? 0)))
      .catch(() => {});
  }, [p.ticker]);
  const unitUsd = preview && !preview.error ? preview.tokenPriceUsd : f.token === "moji" ? p.stats.priceUsd : stockPrice;
  const giveUsd = Number(f.amount) > 0 && unitUsd > 0 ? Number(f.amount) * unitUsd : 0;

  const base = `/api/mojis/${encodeURIComponent(p.combo)}/drops`;
  const qs = `chain=${p.chainId}&pair=${p.stockAddress}`;

  const load = useCallback(async () => {
    const r = await fetch(`${base}?${qs}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as DropsView;
    setView(j);
    const open = j.drops.find((d) => d.status === "draft" || d.status === "sending");
    if (open) {
      const rr = await fetch(`${base}/${open.id}?${qs}`, { cache: "no-store" });
      if (rr.ok) setActive((await rr.json()) as { drop: DropRow; payouts: PayoutRow[] });
    } else setActive(null);
  }, [base, qs]);
  useEffect(() => {
    void load();
  }, [load]);

  // wallet balances of both tokens
  useEffect(() => {
    if (!address || !chain?.viem || !p.tokenAddress) return setBalances(null);
    const pc = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
    Promise.all([
      pc.readContract({ address: p.stockAddress as Address, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [address as Address] }),
      pc.readContract({ address: p.tokenAddress as Address, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [address as Address] }),
    ])
      .then(([stock, moji]) => setBalances({ stock: stock as bigint, moji: moji as bigint }))
      .catch(() => setBalances(null));
  }, [address, chain?.viem, p.stockAddress, p.tokenAddress, view]);

  // live preview, debounced
  useEffect(() => {
    if (!f.amount || Number(f.amount) <= 0) return setPreview(null);
    const t = setTimeout(async () => {
      setPreviewing(true);
      const q = new URLSearchParams({ chain: String(p.chainId), pair: p.stockAddress, token: f.token, amount: f.amount, topN: f.topN, holdDays: f.holdDays, minHold: f.minHold || "0", minPayoutUsd: f.minPayoutUsd, split: f.split, capBps: String(capBps), excluded: f.excluded.split(/[\s,]+/).filter(Boolean).join(",") });
      try {
        const r = await fetch(`${base}/preview?${q}`, { cache: "no-store" });
        setPreview((await r.json()) as Preview);
      } catch (e) {
        setPreview({ error: String(e) } as Preview);
      } finally {
        setPreviewing(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [f, capBps, base, p.chainId, p.stockAddress]);

  const set = (k: keyof typeof DEFAULTS) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  /** Send every pending payout of `d` as a plain transfer, then the fee. Records hashes as it goes; resumable. */
  async function sendPending(d: { drop: DropRow; payouts: PayoutRow[] }) {
    if (!wallet || !address || !chain?.viem) return;
    const provider = await ensureChain(wallet, chain.viem);
    const pc = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
    const wc = createWalletClient({ chain: chain.viem, account: address as Address, transport: custom(provider) });
    const token = d.drop.token_address as Address;
    const pending = d.payouts.filter((x) => !x.tx_hash);
    const total = d.payouts.length;
    let hashes: Hex[] = [];
    const flush = async () => {
      if (!hashes.length) return;
      const r = await fetch(`${base}/${d.drop.id}/sent?${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHashes: hashes }) });
      hashes = [];
      if (r.ok) {
        const j = (await r.json()) as { drop: DropRow; payouts: PayoutRow[] };
        setActive({ drop: j.drop, payouts: j.payouts });
      }
    };
    let done = total - pending.length;
    for (const x of pending) {
      if (stop.current) break;
      setBusy(`${done + 1} of ${total} · ${short(x.address)}`);
      const h = await wc.writeContract({ address: token, abi: ERC20_MIN_ABI, functionName: "transfer", args: [x.address as Address, BigInt(x.amount_wei)] });
      await pc.waitForTransactionReceipt({ hash: h });
      hashes.push(h);
      done++;
      if (hashes.length >= 5) await flush();
    }
    await flush();
    if (stop.current) return;
    const fee = BigInt(d.drop.fee_wei);
    if (fee > 0n && !d.drop.fee_tx && view?.feeRecipient) {
      setBusy("fee → moji");
      const h = await wc.writeContract({ address: token, abi: ERC20_MIN_ABI, functionName: "transfer", args: [view.feeRecipient as Address, fee] });
      await pc.waitForTransactionReceipt({ hash: h });
      hashes.push(h);
      await flush();
    }
  }

  async function start() {
    if (running.current || !wallet || !address || !chain?.viem || !tokenAddr || amountWei == null) return;
    running.current = true;
    stop.current = false;
    setErr(null);
    try {
      const rules: DropRules = {
        v: 2,
        moji: p.combo,
        mojiId: p.mojiId,
        chainId: p.chainId,
        token: f.token,
        tokenAddress: tokenAddr.toLowerCase(),
        amount: f.amount.trim(),
        topN: Number(f.topN),
        holdDays: Number(f.holdDays),
        minHold: (f.minHold || "0").trim(),
        minPayoutUsd: Number(f.minPayoutUsd),
        split: f.split,
        capBps,
        excluded: [...new Set(f.excluded.split(/[\s,]+/).filter(Boolean).map((a) => a.toLowerCase()))],
      };
      const provider = await ensureChain(wallet, chain.viem);
      const wc = createWalletClient({ chain: chain.viem, account: address as Address, transport: custom(provider) });
      setBusy("sign");
      const signature = await wc.signMessage({ message: canonicalRulesMessage(rules) });
      setBusy("ranking…");
      const created = await fetch(`${base}?${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rules, signature, signer: address }) });
      const cj = (await created.json()) as { drop?: DropRow; payouts?: PayoutRow[]; error?: string };
      if (!created.ok || !cj.drop || !cj.payouts) throw new Error(cj.error ?? "could not start the drop");
      setActive({ drop: cj.drop, payouts: cj.payouts });
      setF(DEFAULTS);
      await sendPending({ drop: cj.drop, payouts: cj.payouts });
      await load();
    } catch (e) {
      setErr(friendly(e));
      await load();
    } finally {
      setBusy(null);
      running.current = false;
    }
  }

  async function resume() {
    if (running.current || !active) return;
    running.current = true;
    stop.current = false;
    setErr(null);
    try {
      await sendPending(active);
      await load();
    } catch (e) {
      setErr(friendly(e));
      await load();
    } finally {
      setBusy(null);
      running.current = false;
    }
  }

  async function cancel() {
    if (!active || !wallet || !address || !chain?.viem) return;
    try {
      const provider = await ensureChain(wallet, chain.viem);
      const wc = createWalletClient({ chain: chain.viem, account: address as Address, transport: custom(provider) });
      const signature = await wc.signMessage({ message: `cancel drop ${active.drop.id}` });
      const r = await fetch(`${base}/${active.drop.id}/cancel?${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signature, signer: address }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "could not cancel");
      setActive(null);
      await load();
    } catch (e) {
      setErr(friendly(e));
    }
  }

  const ready = Boolean(preview && !preview.error && preview.paid > 0) && !previewing;
  const transfers = preview ? preview.paid + (Number(preview.fee) > 0 ? 1 : 0) : 0;
  const canStart = isCreator && Boolean(p.tokenAddress) && amountWei != null && amountWei > 0n && !overBalance && !busy && !active && ready;
  const pendingCount = active ? active.payouts.filter((x) => !x.tx_hash).length : 0;
  const lastSent = view?.drops.find((d) => d.status === "sent");
  const problem = !isCreator
    ? `connect the wallet that launched ${p.combo}`
    : overBalance
      ? `not enough ${symbol} for the amount plus the ${feeBps / 100}% fee`
      : preview?.error
        ? preview.error
        : preview && !previewing && preview.eligible === 0
          ? "no wallet meets these rules yet"
          : preview && !previewing && preview.paid === 0
            ? `every share is under $${f.minPayoutUsd}. raise the amount or pay fewer holders`
            : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="holders" value={String(p.stats.holders)} />
        <Tile label="dropped so far" value={usd(p.stats.dropsPaidUsd)} sub={lastSent ? `last ${dateShort(lastSent.completed_at ?? lastSent.cut_at)}` : undefined} tone="mint" />
        <Tile label={`your ${p.ticker}`} value={balances ? fmtTok(formatUnits(balances.stock, p.stockDecimals)) : "—"} />
        <Tile label={`your ${p.combo}`} value={balances ? fmtTok(formatUnits(balances.moji, 18), 0) : "—"} />
      </div>

      {active && (
        <section className="clay pop pop-1 bg-sky-50 p-4">
          <div className="flex items-baseline justify-between">
            <span className="heading text-[17px] text-ink">
              {fmtTok(active.drop.amount)} {active.drop.token_symbol} → {active.drop.recipients} holders
            </span>
            <span className="num text-[15px] text-ink-soft">
              {active.drop.recipients - pendingCount}/{active.drop.recipients}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-mint transition-[width]" style={{ width: `${((active.drop.recipients - pendingCount) / Math.max(1, active.drop.recipients)) * 100}%` }} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={resume} disabled={Boolean(busy) || !isCreator || pendingCount === 0} className="press clay heading flex-1 bg-sky-500 px-4 py-3 text-[15px] text-white disabled:opacity-60">
              {busy ? `sending ${busy}` : pendingCount > 0 ? `Send ${pendingCount} left` : "done"}
            </button>
            {busy ? (
              <button onClick={() => (stop.current = true)} className="press clay-pill heading bg-white px-4 py-3 text-[13px] text-ink">
                pause
              </button>
            ) : (
              <button onClick={cancel} disabled={!isCreator} className="press clay-pill heading bg-white px-4 py-3 text-[13px] text-coral">
                stop
              </button>
            )}
          </div>
          <div className="mt-3 max-h-[200px] overflow-y-auto">
            {active.payouts.map((x) => (
              <div key={x.address} className="flex items-center gap-2 py-0.5 text-[12px]">
                <span className="w-6 text-ink-soft">{x.rank}</span>
                <span className="mono flex-1 text-ink">{short(x.address, 6, 4)}</span>
                <span className="num text-ink">{fmtTok(formatUnits(BigInt(x.amount_wei), active.drop.token_decimals), 5)}</span>
                {x.tx_hash ? (
                  <a href={explorerTx(p.chainId, x.tx_hash)} target="_blank" rel="noopener noreferrer" className="w-8 text-right text-mint">
                    ✓
                  </a>
                ) : (
                  <span className="w-8 text-right text-ink-soft">·</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`clay pop pop-2 bg-white p-4 ${active ? "pointer-events-none opacity-50" : ""}`}>
        <Label className="mb-3">New drop</Label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="give" unit={symbol} hint={giveUsd > 0 ? `≈ ${usd(giveUsd)}` : unitUsd > 0 ? `1 ${symbol} ≈ ${usd(unitUsd)}` : undefined} value={f.amount} onChange={set("amount")} disabled={Boolean(active)} />
          <Field label="in">
            <select className="heading bg-transparent text-[18px] text-ink outline-none" value={f.token} onChange={(e) => set("token")(e.target.value)} disabled={Boolean(active)}>
              <option value="stock">{p.ticker}</option>
              <option value="moji">{p.combo}</option>
            </select>
          </Field>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Field label="top" unit="holders" mode="numeric" value={f.topN} onChange={set("topN")} disabled={Boolean(active)} />
          <Field label="held for" unit="days" mode="numeric" value={f.holdDays} onChange={set("holdDays")} disabled={Boolean(active)} />
          <Field label="min" unit={p.combo} hint={Number(f.minHold) > 0 && p.stats.priceUsd > 0 ? `≈ ${usd(Number(f.minHold) * p.stats.priceUsd)}` : undefined} value={f.minHold} onChange={set("minHold")} disabled={Boolean(active)} />
        </div>

        <button type="button" onClick={() => setMore((v) => !v)} className="heading mt-3 text-[12px] text-sky-600">
          {more ? "fewer options" : "more options"}
        </button>
        {more && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <Field label="split">
                <select className="heading w-full bg-transparent text-[15px] text-ink outline-none" value={f.split} onChange={(e) => set("split")(e.target.value)} disabled={Boolean(active)}>
                  <option value="prorata">by holding</option>
                  <option value="equal">equal</option>
                </select>
              </Field>
              <Field label="max per wallet" unit="%" value={f.maxPct} onChange={set("maxPct")} disabled={Boolean(active) || f.split === "equal"} />
              <Field label="min payout" unit="$" value={f.minPayoutUsd} onChange={set("minPayoutUsd")} disabled={Boolean(active)} />
            </div>
            <textarea className="clay-input min-h-[48px] text-[12px]" placeholder="skip these wallets (one per line)" value={f.excluded} onChange={(e) => set("excluded")(e.target.value)} disabled={Boolean(active)} />
          </div>
        )}

        <div className="clay-sm mt-4 bg-sky-50 px-4 py-3">
          {!f.amount ? (
            <p className="text-[13px] text-ink-soft">type an amount</p>
          ) : previewing || !preview ? (
            <p className="text-[13px] text-ink-soft">…</p>
          ) : problem ? (
            <p className="text-[13px] text-coral">{problem}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="num text-[22px] leading-none text-ink">{preview.paid}</div>
                  <div className="heading mt-1 text-[10px] uppercase tracking-[0.1em] text-ink-soft">wallets</div>
                </div>
                <div>
                  <div className="num text-[22px] leading-none text-ink">{usd(preview.medianUsd)}</div>
                  <div className="heading mt-1 text-[10px] uppercase tracking-[0.1em] text-ink-soft">typical</div>
                </div>
                <div>
                  <div className="num text-[22px] leading-none text-ink">{usd(preview.maxUsd)}</div>
                  <div className="heading mt-1 text-[10px] uppercase tracking-[0.1em] text-ink-soft">biggest</div>
                </div>
              </div>
              <p className="mt-3 text-center text-[12px] text-ink-soft">
                {fmtTok(preview.toHolders, 5)} + {fmtTok(preview.fee, 5)} fee = <b className="text-ink">{fmtTok(preview.total, 5)} {preview.token.symbol}</b>
                {preview.thresholdMoji && <> · cutoff {fmtTok(preview.thresholdMoji, 0)} {p.combo}</>}
              </p>
            </>
          )}
        </div>

        <button onClick={start} disabled={!canStart} className="press clay heading mt-3 w-full bg-sky-500 px-5 py-3.5 text-[17px] text-white disabled:opacity-60">
          {busy ?? (ready ? `Send ${transfers} transfers` : "Send")}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-soft">one wallet signature per transfer · {feeBps / 100}% fee to moji · stop any time</p>
        {err && (
          <p className="clay-sm mt-2 bg-white px-3 py-2 text-center text-[12px] text-coral" role="alert">
            {err}
          </p>
        )}
      </section>

      <DropList p={p} view={view} />
    </div>
  );
}

function DropList({ p, view }: { p: ManageProps; view: DropsView | null }) {
  if (!view) return null;
  const past = view.drops.filter((d) => d.status === "sent" || d.status === "cancelled");
  if (past.length === 0) return null;
  return (
    <section className="clay pop pop-3 bg-white p-4">
      <Label className="mb-2">Past drops</Label>
      <div className="flex flex-col gap-1.5">
        {past.map((d) => (
          <div key={d.id} className="flex items-center gap-3 text-[13px]">
            <span className="w-[64px] shrink-0 text-ink-soft">{dateShort(d.completed_at ?? d.cut_at)}</span>
            <span className="heading flex-1 text-ink">
              {fmtTok(formatUnits(BigInt(d.sent_wei), d.token_decimals), 5)} {d.token_symbol} → {d.sent_count}
              {d.status === "cancelled" && <span className="text-ink-soft"> of {d.recipients}</span>}
            </span>
            <span className="num text-mint">{usd(d.sent_usd)}</span>
            {d.fee_tx && (
              <a href={explorerTx(p.chainId, d.fee_tx)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-600">
                tx
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function friendly(e: unknown): string {
  const raw = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
  const m = raw.toLowerCase();
  if (m.includes("rejected") || m.includes("denied") || m.includes("cancel")) return "cancelled in your wallet.";
  if (m.includes("insufficient funds") || m.includes("gas")) return "not enough ETH for gas.";
  return raw.split("\n")[0].slice(0, 120);
}
