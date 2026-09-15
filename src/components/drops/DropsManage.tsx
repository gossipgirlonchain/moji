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
            <p className="mt-1 text-[11px] text-ink-soft">buckets are in {p.combo} tokens, not dollars, so they do not move with price.</p>
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

const DEFAULTS = { token: "stock" as TokenKind, amount: "", topN: "100", holdDays: "3", minHold: "0", minPayoutUsd: "2", split: "prorata" as Split, capBps: "500", excluded: "" };

function DropsTab(p: ManageProps) {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const wallet = useMemo(() => wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase()) ?? pickWallet(wallets), [wallets, address]);
  const isCreator = Boolean(address && p.creatorAddress && address.toLowerCase() === p.creatorAddress.toLowerCase());
  const chain = chainById(p.chainId);

  const [f, setF] = useState(DEFAULTS);
  const [view, setView] = useState<DropsView | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  /** the drop being sent right now (or resumed) */
  const [active, setActive] = useState<{ drop: DropRow; payouts: PayoutRow[] } | null>(null);
  const running = useRef(false);
  const stop = useRef(false);

  const tokenAddr = (f.token === "moji" ? p.tokenAddress : p.stockAddress) as Address | null;
  const decimals = f.token === "moji" ? 18 : p.stockDecimals;
  const symbol = f.token === "moji" ? p.combo : p.ticker;
  const amountWei = useMemo(() => {
    try {
      return parseUnits(f.amount || "0", decimals);
    } catch {
      return null;
    }
  }, [f.amount, decimals]);
  const totalWei = useMemo(() => {
    if (amountWei == null) return null;
    const bps = BigInt(preview?.feeBps ?? view?.feeBps ?? 50);
    return amountWei + (amountWei * bps) / 10_000n;
  }, [amountWei, preview?.feeBps, view?.feeBps]);
  const overBalance = balance != null && totalWei != null && totalWei > balance;

  const base = `/api/mojis/${encodeURIComponent(p.combo)}/drops`;
  const qs = `chain=${p.chainId}&pair=${p.stockAddress}`;

  const load = useCallback(async () => {
    const r = await fetch(`${base}?${qs}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as DropsView;
    setView(j);
    // resume a drop that is still being sent
    const open = j.drops.find((d) => d.status === "draft" || d.status === "sending");
    if (open) {
      const rr = await fetch(`${base}/${open.id}?${qs}`, { cache: "no-store" });
      if (rr.ok) setActive((await rr.json()) as { drop: DropRow; payouts: PayoutRow[] });
    } else setActive(null);
  }, [base, qs]);
  useEffect(() => {
    void load();
  }, [load]);

  // wallet balance of the chosen token
  useEffect(() => {
    if (!address || !tokenAddr || !chain?.viem) return setBalance(null);
    const pc = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
    pc.readContract({ address: tokenAddr, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [address as Address] })
      .then((b) => setBalance(b as bigint))
      .catch(() => setBalance(null));
  }, [address, tokenAddr, chain?.viem, view]);

  // live preview, debounced
  useEffect(() => {
    if (!f.amount || Number(f.amount) <= 0) return setPreview(null);
    const t = setTimeout(async () => {
      setPreviewing(true);
      const q = new URLSearchParams({ chain: String(p.chainId), pair: p.stockAddress, token: f.token, amount: f.amount, topN: f.topN, holdDays: f.holdDays, minHold: f.minHold || "0", minPayoutUsd: f.minPayoutUsd, split: f.split, capBps: f.capBps, excluded: f.excluded.split(/[\s,]+/).filter(Boolean).join(",") });
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
  }, [f, base, p.chainId, p.stockAddress]);

  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

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
      setBusy(`sending ${done + 1} of ${total} · ${fmtTok(formatUnits(BigInt(x.amount_wei), d.drop.token_decimals), 6)} ${d.drop.token_symbol} → ${short(x.address)}`);
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
      setBusy(`processing fee · ${fmtTok(formatUnits(fee, d.drop.token_decimals), 6)} ${d.drop.token_symbol} → moji`);
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
        capBps: Number(f.capBps),
        excluded: [...new Set(f.excluded.split(/[\s,]+/).filter(Boolean).map((a) => a.toLowerCase()))],
      };
      const provider = await ensureChain(wallet, chain.viem);
      const wc = createWalletClient({ chain: chain.viem, account: address as Address, transport: custom(provider) });
      setBusy("sign the rules");
      const signature = await wc.signMessage({ message: canonicalRulesMessage(rules) });
      setBusy("ranking holders…");
      const created = await fetch(`${base}?${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rules, signature, signer: address }) });
      const cj = (await created.json()) as { drop?: DropRow; payouts?: PayoutRow[]; error?: string };
      if (!created.ok || !cj.drop || !cj.payouts) throw new Error(cj.error ?? "could not cut the drop");
      setActive({ drop: cj.drop, payouts: cj.payouts });
      setF(DEFAULTS);
      setAck(false);
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

  const canStart = isCreator && Boolean(p.tokenAddress) && amountWei != null && amountWei > 0n && !overBalance && ack && !busy && !active && Number(f.topN) > 0 && Boolean(preview && !preview.error && preview.paid > 0);
  const pendingCount = active ? active.payouts.filter((x) => !x.tx_hash).length : 0;

  return (
    <div className="flex flex-col gap-3">
      {!isCreator && <p className="clay-sm bg-white px-3 py-2 text-center text-[12px] text-ink-soft">connect the wallet that launched {p.combo} to drop to its holders.</p>}

      {active && (
        <section className="clay pop pop-1 bg-sky-50 p-4">
          <Label className="mb-1">{active.drop.status === "draft" ? "Ready to send" : "Sending"}</Label>
          <p className="text-[14px] text-ink">
            {fmtTok(active.drop.amount)} {active.drop.token_symbol} to {active.drop.recipients} holders · {active.drop.recipients - pendingCount} sent, {pendingCount} to go
            {BigInt(active.drop.fee_wei) > 0n && <span className="text-ink-soft"> · fee {active.drop.fee_tx ? "paid" : "pending"}</span>}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">one plain transfer per holder from your wallet, confirmed on-chain before the next one. you can close this page and come back; sent ones stay sent.</p>
          {busy && <p className="mt-2 text-[12px] text-ink">{busy}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={resume} disabled={Boolean(busy) || !isCreator || pendingCount === 0} className="press clay heading flex-1 bg-sky-500 px-4 py-3 text-[15px] text-white disabled:opacity-60">
              {busy ? "sending…" : pendingCount > 0 ? `Send ${pendingCount} transfer${pendingCount === 1 ? "" : "s"}` : "all sent"}
            </button>
            {busy ? (
              <button onClick={() => (stop.current = true)} className="press clay-pill heading bg-white px-4 py-3 text-[13px] text-ink">
                pause
              </button>
            ) : (
              <button onClick={cancel} disabled={!isCreator} className="press clay-pill heading bg-white px-4 py-3 text-[13px] text-coral">
                cancel rest
              </button>
            )}
          </div>
          <div className="mt-3 max-h-[220px] overflow-y-auto">
            {active.payouts.map((x) => (
              <div key={x.address} className="flex items-center gap-2 py-0.5 text-[12px]">
                <span className="w-6 text-ink-soft">{x.rank}</span>
                <span className="mono flex-1 text-ink">{short(x.address, 6, 4)}</span>
                <span className="num text-ink">
                  {fmtTok(formatUnits(BigInt(x.amount_wei), active.drop.token_decimals), 5)} {active.drop.token_symbol}
                </span>
                {x.tx_hash ? (
                  <a href={explorerTx(p.chainId, x.tx_hash)} target="_blank" rel="noopener noreferrer" className="w-10 text-right text-mint">
                    sent
                  </a>
                ) : (
                  <span className="w-10 text-right text-ink-soft">…</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`clay pop pop-2 bg-white p-4 ${active ? "opacity-60" : ""}`}>
        <Label className="mb-3">New drop</Label>
        <div className="flex flex-col gap-3 text-[14px]">
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">give</span>
            <input className="clay-input num flex-1" inputMode="decimal" placeholder="0.0" value={f.amount} onChange={set("amount")} disabled={Boolean(active)} />
            <select className="clay-input w-[130px]" value={f.token} onChange={set("token")} disabled={Boolean(active)}>
              <option value="stock">{p.ticker}</option>
              <option value="moji">{p.combo}</option>
            </select>
          </div>
          <p className="-mt-1 pl-[72px] text-[12px] text-ink-soft">
            {balance != null ? `you have ${fmtTok(formatUnits(balance, decimals))} ${symbol}` : "connect to see your balance"}
            {overBalance && <span className="text-coral"> · not enough for the amount plus the fee</span>}
          </p>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">to the top</span>
            <input className="clay-input num w-[90px]" inputMode="numeric" value={f.topN} onChange={set("topN")} disabled={Boolean(active)} />
            <span className="text-ink-soft">holders</span>
          </div>

          <Label className="mt-1">Who counts as a holder</Label>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">held for</span>
            <input className="clay-input num w-[90px]" inputMode="numeric" value={f.holdDays} onChange={set("holdDays")} disabled={Boolean(active)} />
            <span className="text-ink-soft">days (0 = balance right now)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">at least</span>
            <input className="clay-input num flex-1" inputMode="decimal" value={f.minHold} onChange={set("minHold")} disabled={Boolean(active)} />
            <span className="text-ink-soft">{p.combo}</span>
          </div>
          <p className="-mt-1 pl-[72px] text-[12px] text-ink-soft">in {p.combo} tokens, not dollars. a wallet is ranked on the smallest amount it held across the whole window, so buying this morning does not count.</p>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">split</span>
            <select className="clay-input flex-1" value={f.split} onChange={set("split")} disabled={Boolean(active)}>
              <option value="prorata">pro-rata by holding</option>
              <option value="equal">equal shares</option>
            </select>
            {f.split === "prorata" && (
              <>
                <span className="text-ink-soft">cap</span>
                <input className="clay-input num w-[64px]" inputMode="numeric" value={f.capBps} onChange={set("capBps")} disabled={Boolean(active)} />
                <span className="text-ink-soft">bps</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">min payout</span>
            <span className="text-ink-soft">$</span>
            <input className="clay-input num w-[80px]" inputMode="decimal" value={f.minPayoutUsd} onChange={set("minPayoutUsd")} disabled={Boolean(active)} />
            <span className="text-[12px] text-ink-soft">wallets under this are skipped and their share goes to the rest</span>
          </div>
          <textarea className="clay-input min-h-[56px] text-[12px]" placeholder="exclude addresses (optional, one per line). the pool, you and moji are always excluded." value={f.excluded} onChange={set("excluded")} disabled={Boolean(active)} />
        </div>

        <div className="clay-sm mt-4 bg-sky-50 px-4 py-3 text-[13px]">
          <Label className="mb-1">Preview · today&apos;s holders</Label>
          {!f.amount && <p className="text-ink-soft">type an amount to see who would be paid.</p>}
          {previewing && <p className="text-ink-soft">computing…</p>}
          {preview?.error && <p className="text-coral">{preview.error}</p>}
          {preview && !preview.error && !previewing && (
            <>
              <p className="text-ink">
                {preview.paid} of {preview.eligible} qualifying wallets get paid · median <b>{usd(preview.medianUsd)}</b> · largest <b>{usd(preview.maxUsd)}</b>
                {preview.belowFloor > 0 && <span className="text-ink-soft"> · {preview.belowFloor} under the ${f.minPayoutUsd} floor</span>}
              </p>
              <p className="mt-1 text-[12px] text-ink-soft">
                rank {f.topN} needs at least {preview.thresholdMoji ? `${fmtTok(preview.thresholdMoji, 0)} ${p.combo}` : "—"} held for {f.holdDays} days · {preview.token.symbol} at {usd(preview.tokenPriceUsd)}
              </p>
              <p className="mt-1 text-[12px] text-ink">
                {fmtTok(preview.toHolders, 6)} {preview.token.symbol} to holders + {fmtTok(preview.fee, 6)} {preview.token.symbol} processing fee ({preview.feeBps / 100}%) = <b>{fmtTok(preview.total, 6)} {preview.token.symbol}</b> in {preview.paid + (Number(preview.fee) > 0 ? 1 : 0)} transfers
              </p>
              {preview.paid === 0 && preview.eligible > 0 && <p className="mt-1 text-[12px] text-coral">every payout is under the floor. raise the amount, lower the floor, or pay fewer holders.</p>}
              {preview.eligible === 0 && <p className="mt-1 text-[12px] text-coral">nobody meets the hold rules yet. open the stats tab once so holders get scanned, or lower the hold days.</p>}
              {preview.top.length > 0 && (
                <div className="mt-2 flex flex-col gap-0.5">
                  {preview.top.slice(0, 5).map((t) => (
                    <div key={t.address} className="flex items-center gap-2 text-[12px]">
                      <span className="w-5 text-ink-soft">{t.rank}</span>
                      <span className="mono text-ink">{short(t.address, 6, 4)}</span>
                      <span className="flex-1 text-right text-ink-soft">{fmtTok(t.held, 0)} held</span>
                      <span className="w-[110px] text-right num text-ink">
                        {fmtTok(t.amount, 5)} {preview.token.symbol}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <label className="mt-4 flex items-start gap-2 text-[12px] text-ink-soft">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" disabled={Boolean(active)} />
          <span>the ranking is cut when you sign. each holder gets a plain transfer from your wallet, one signature each, and the {preview ? preview.feeBps / 100 : 0.5}% processing fee goes to moji as one more transfer at the end. nothing is locked; you can stop at any point and the rest is simply not sent.</span>
        </label>
        <button onClick={start} disabled={!canStart} className="press clay heading mt-3 w-full bg-sky-500 px-5 py-3.5 text-[17px] text-white disabled:opacity-60">
          {busy ?? (preview && !preview.error && preview.paid > 0 ? `Sign and send ${preview.paid + (Number(preview.fee) > 0 ? 1 : 0)} transfers` : "Sign and send")}
        </button>
        <p className="mt-1 text-center text-[11px] text-ink-soft">you pay gas on {chain?.name ?? "the chain"} for every transfer.</p>
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
  if (!view) return <p className="text-center text-[13px] text-ink-soft">loading…</p>;
  const past = view.drops.filter((d) => d.status === "sent" || d.status === "cancelled");
  if (past.length === 0) return <p className="text-center text-[13px] text-ink-soft">no drops sent yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <Label>Past drops</Label>
      {past.map((d) => (
        <section key={d.id} className="clay pop bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="heading text-[15px] text-ink">
              {fmtTok(formatUnits(BigInt(d.sent_wei), d.token_decimals), 5)} {d.token_symbol} → {d.sent_count} holders
            </span>
            <span className={`heading rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] ${d.status === "sent" ? "bg-mint text-white" : "bg-sky-100 text-ink-soft"}`}>{d.status === "sent" ? "sent" : `stopped · ${d.sent_count} of ${d.recipients}`}</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-soft">
            {dateShort(d.completed_at ?? d.cut_at)} · top {d.top_n} · hold {d.hold_days}d{Number(d.min_hold) > 0 ? ` · min ${fmtTok(d.min_hold, 0)} ${p.combo}` : ""} · {d.split === "equal" ? "equal shares" : `pro-rata, cap ${d.cap_bps / 100}%`} · floor ${d.min_payout_usd} · {usd(d.sent_usd)}
            {d.fee_tx && (
              <>
                {" · "}
                <a href={explorerTx(p.chainId, d.fee_tx)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                  fee
                </a>
              </>
            )}
          </p>
        </section>
      ))}
    </div>
  );
}

function friendly(e: unknown): string {
  const raw = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
  const m = raw.toLowerCase();
  if (m.includes("rejected") || m.includes("denied") || m.includes("cancel")) return "cancelled in your wallet. what was sent stays sent; press Send to continue.";
  if (m.includes("insufficient funds") || m.includes("gas")) return "not enough ETH for gas.";
  return raw.split("\n")[0].slice(0, 160);
}
