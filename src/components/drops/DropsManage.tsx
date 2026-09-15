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
import { ERC20_MIN_ABI, MOJI_DROPS_ABI, campaignKey } from "@/lib/drops/contract";
import { canonicalRulesMessage, type CampaignRow, type CampaignRules, type RoundRow, type Split, type TokenKind } from "@/lib/drops/types";

export type ManageProps = {
  combo: string;
  ticker: string;
  chainId: number;
  stockAddress: string;
  stockDecimals: number;
  tokenAddress: string | null;
  creatorAddress: string | null;
  mojiId: string;
  escrow: string | null;
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
  perRound: string;
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

type DropsView = { campaigns: CampaignRow[]; rounds: RoundRow[]; operator: boolean };

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
            <p className="mt-2 text-[12px] text-ink-soft">median holder {fmtTok(formatUnits(BigInt(sum.median), 18), 0)} {p.combo} · drops paid so far {usd(s.dropsPaidUsd)}</p>
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

const DEFAULTS = { token: "stock" as TokenKind, amount: "", topN: "100", days: "7", holdDays: "3", minHold: "0", minPayoutUsd: "2", split: "prorata" as Split, capBps: "500", cutHourUtc: "9", excluded: "" };

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
  const running = useRef(false);

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
  const overBalance = balance != null && amountWei != null && amountWei > balance;

  const load = useCallback(async () => {
    const r = await fetch(`/api/mojis/${encodeURIComponent(p.combo)}/drops?chain=${p.chainId}&pair=${p.stockAddress}`, { cache: "no-store" });
    if (r.ok) setView((await r.json()) as DropsView);
  }, [p.combo, p.chainId, p.stockAddress]);
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
      const q = new URLSearchParams({ chain: String(p.chainId), pair: p.stockAddress, token: f.token, amount: f.amount, topN: f.topN, days: f.days, holdDays: f.holdDays, minHold: f.minHold || "0", minPayoutUsd: f.minPayoutUsd, split: f.split, capBps: f.capBps, cutHourUtc: f.cutHourUtc, excluded: f.excluded.split(/[\s,]+/).filter(Boolean).join(",") });
      try {
        const r = await fetch(`/api/mojis/${encodeURIComponent(p.combo)}/drops/preview?${q}`, { cache: "no-store" });
        setPreview((await r.json()) as Preview);
      } catch (e) {
        setPreview({ error: String(e) } as Preview);
      } finally {
        setPreviewing(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [f, p.combo, p.chainId, p.stockAddress]);

  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function start() {
    if (running.current || !wallet || !address || !chain?.viem || !tokenAddr || !p.escrow || amountWei == null) return;
    running.current = true;
    setErr(null);
    try {
      const rules: CampaignRules = {
        v: 1,
        moji: p.combo,
        mojiId: p.mojiId,
        chainId: p.chainId,
        token: f.token,
        tokenAddress: tokenAddr.toLowerCase(),
        amount: f.amount.trim(),
        topN: Number(f.topN),
        days: Number(f.days),
        holdDays: Number(f.holdDays),
        minHold: (f.minHold || "0").trim(),
        minPayoutUsd: Number(f.minPayoutUsd),
        split: f.split,
        capBps: Number(f.capBps),
        cutHourUtc: Number(f.cutHourUtc),
        excluded: [...new Set(f.excluded.split(/[\s,]+/).filter(Boolean).map((a) => a.toLowerCase()))],
      };
      const provider = await ensureChain(wallet, chain.viem);
      const pc = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
      const wc = createWalletClient({ chain: chain.viem, account: address as Address, transport: custom(provider) });

      setBusy("sign the rules");
      const signature = await wc.signMessage({ message: canonicalRulesMessage(rules) });
      const created = await fetch(`/api/mojis/${encodeURIComponent(p.combo)}/drops?chain=${p.chainId}&pair=${p.stockAddress}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rules, signature, signer: address }) });
      const cj = (await created.json()) as { campaign?: CampaignRow; error?: string };
      if (!created.ok || !cj.campaign) throw new Error(cj.error ?? "could not save the campaign");
      const c = cj.campaign;

      const escrow = p.escrow as Address;
      const allowance = (await pc.readContract({ address: tokenAddr, abi: ERC20_MIN_ABI, functionName: "allowance", args: [address as Address, escrow] })) as bigint;
      if (allowance < amountWei) {
        setBusy(`approve ${fmtTok(f.amount)} ${symbol}`);
        const h = await wc.writeContract({ address: tokenAddr, abi: ERC20_MIN_ABI, functionName: "approve", args: [escrow, amountWei] });
        await pc.waitForTransactionReceipt({ hash: h });
      }
      setBusy(`lock ${fmtTok(f.amount)} ${symbol} in escrow`);
      const reclaimAfter = BigInt(Math.floor(Date.now() / 1000) + (Number(f.days) + 8) * 86_400);
      const { request } = await pc.simulateContract({ address: escrow, abi: MOJI_DROPS_ABI, functionName: "fund", args: [tokenAddr, amountWei, reclaimAfter, campaignKey(c.id)], account: address as Address });
      const fundHash: Hex = await wc.writeContract(request);
      setBusy("confirming…");
      await pc.waitForTransactionReceipt({ hash: fundHash });
      const fr = await fetch(`/api/mojis/${encodeURIComponent(p.combo)}/drops/${c.id}/funded?chain=${p.chainId}&pair=${p.stockAddress}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: fundHash }) });
      const fj = (await fr.json()) as { error?: string };
      if (!fr.ok) throw new Error(fj.error ?? "funded on-chain but not recorded; the cron will not pick it up until it is");
      setF(DEFAULTS);
      setAck(false);
      await load();
    } catch (e) {
      const raw = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
      setErr(/rejected|denied|cancel/i.test(raw) ? "cancelled in your wallet." : raw.split("\n")[0].slice(0, 160));
    } finally {
      setBusy(null);
      running.current = false;
    }
  }

  const perDay = amountWei != null && Number(f.days) > 0 ? formatUnits(amountWei / BigInt(Math.max(1, Number(f.days))), decimals) : "0";
  const canStart = isCreator && Boolean(p.escrow) && Boolean(p.tokenAddress) && amountWei != null && amountWei > 0n && !overBalance && ack && !busy && Number(f.topN) > 0 && Number(f.days) > 0;

  return (
    <div className="flex flex-col gap-3">
      {!p.escrow && <p className="clay-sm bg-white px-3 py-2 text-center text-[12px] text-coral">NEXT_PUBLIC_DROPS_CONTRACT is not set for this chain. Deploy the escrow first (npm run drops:deploy).</p>}
      {view && !view.operator && <p className="clay-sm bg-white px-3 py-2 text-center text-[12px] text-coral">DROPS_OPERATOR_PRIVATE_KEY is not set: campaigns can be funded but rounds will not be paid.</p>}
      {!isCreator && <p className="clay-sm bg-white px-3 py-2 text-center text-[12px] text-ink-soft">connect the wallet that launched {p.combo} to start a drop.</p>}

      <section className="clay pop pop-1 bg-white p-4">
        <Label className="mb-3">New drop</Label>
        <div className="flex flex-col gap-3 text-[14px]">
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">give</span>
            <input className="clay-input num flex-1" inputMode="decimal" placeholder="0.0" value={f.amount} onChange={set("amount")} />
            <select className="clay-input w-[130px]" value={f.token} onChange={set("token")}>
              <option value="stock">{p.ticker}</option>
              <option value="moji">{p.combo}</option>
            </select>
          </div>
          <p className="-mt-1 pl-[72px] text-[12px] text-ink-soft">
            {balance != null ? `you have ${fmtTok(formatUnits(balance, decimals))} ${symbol}` : "connect to see your balance"}
            {overBalance && <span className="text-coral"> · you can&apos;t promise more than you have</span>}
          </p>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">to the top</span>
            <input className="clay-input num w-[90px]" inputMode="numeric" value={f.topN} onChange={set("topN")} />
            <span className="text-ink-soft">holders</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">over</span>
            <input className="clay-input num w-[90px]" inputMode="numeric" value={f.days} onChange={set("days")} />
            <span className="text-ink-soft">days · one round a day at</span>
            <input className="clay-input num w-[56px]" inputMode="numeric" value={f.cutHourUtc} onChange={set("cutHourUtc")} />
            <span className="text-ink-soft">:00 UTC</span>
          </div>
          <p className="-mt-1 pl-[72px] text-[12px] text-ink-soft">
            {amountWei != null && amountWei > 0n ? `${fmtTok(perDay, 6)} ${symbol} per round` : ""}
          </p>

          <Label className="mt-1">Who counts as a holder</Label>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">held for</span>
            <input className="clay-input num w-[90px]" inputMode="numeric" value={f.holdDays} onChange={set("holdDays")} />
            <span className="text-ink-soft">days before each round (0 = balance at the cut)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">at least</span>
            <input className="clay-input num flex-1" inputMode="decimal" value={f.minHold} onChange={set("minHold")} />
            <span className="text-ink-soft">{p.combo}</span>
          </div>
          <p className="-mt-1 pl-[72px] text-[12px] text-ink-soft">in {p.combo} tokens, not dollars. a wallet is ranked on the smallest amount it held across the whole window, so buying in the morning of a round does not count.</p>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">split</span>
            <select className="clay-input flex-1" value={f.split} onChange={set("split")}>
              <option value="prorata">pro-rata by holding</option>
              <option value="equal">equal shares</option>
            </select>
            {f.split === "prorata" && (
              <>
                <span className="text-ink-soft">cap</span>
                <input className="clay-input num w-[64px]" inputMode="numeric" value={f.capBps} onChange={set("capBps")} />
                <span className="text-ink-soft">bps</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[64px] shrink-0 text-ink-soft">min payout</span>
            <span className="text-ink-soft">$</span>
            <input className="clay-input num w-[80px]" inputMode="decimal" value={f.minPayoutUsd} onChange={set("minPayoutUsd")} />
            <span className="text-[12px] text-ink-soft">wallets under this are skipped and their share goes to the rest</span>
          </div>
          <textarea className="clay-input min-h-[56px] text-[12px]" placeholder="exclude addresses (optional, one per line). the pool, you and moji are always excluded." value={f.excluded} onChange={set("excluded")} />
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
              {preview.paid === 0 && preview.eligible > 0 && <p className="mt-1 text-[12px] text-coral">every payout is under the floor. raise the amount, lower the floor, or pay fewer holders.</p>}
              {preview.eligible === 0 && <p className="mt-1 text-[12px] text-coral">nobody meets the hold rules yet{preview.error ? "" : " (or holders have not been scanned; open the stats tab once)"}.</p>}
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
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>
            the full amount is locked in the moji escrow until every round has paid. rules cannot change once funded. anything left over (rounds nobody qualified for) comes back to your wallet at the end.
          </span>
        </label>
        <button onClick={start} disabled={!canStart} className="press clay heading mt-3 w-full bg-sky-500 px-5 py-3.5 text-[17px] text-white disabled:opacity-60">
          {busy ?? (amountWei && amountWei > 0n ? `Lock ${fmtTok(f.amount)} ${symbol} and start` : "Fund and start")}
        </button>
        <p className="mt-1 text-center text-[11px] text-ink-soft">three signatures: the rules, an approval, the deposit. you pay gas on {chain?.name ?? "the chain"}.</p>
        {err && (
          <p className="clay-sm mt-2 bg-white px-3 py-2 text-center text-[12px] text-coral" role="alert">
            {err}
          </p>
        )}
      </section>

      <CampaignList p={p} view={view} />
    </div>
  );
}

function CampaignList({ p, view }: { p: ManageProps; view: DropsView | null }) {
  if (!view) return <p className="text-center text-[13px] text-ink-soft">loading…</p>;
  if (view.campaigns.length === 0) return <p className="text-center text-[13px] text-ink-soft">no drops yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <Label>Your drops</Label>
      {view.campaigns.map((c) => {
        const rounds = view.rounds.filter((r) => r.campaign_id === c.id);
        const paid = Number(formatUnits(BigInt(c.paid_wei), c.token_decimals));
        return (
          <section key={c.id} className="clay pop bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="heading text-[15px] text-ink">
                {fmtTok(c.amount)} {c.token_symbol} → top {c.top_n} · {c.days}d
              </span>
              <span className={`heading rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] ${c.status === "running" ? "bg-mint text-white" : c.status === "draft" ? "bg-coral text-white" : "bg-sky-100 text-ink-soft"}`}>{c.status === "draft" ? "unfunded" : c.status}</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-soft">
              hold {c.hold_days}d · min {fmtTok(c.min_hold, 0)} {p.combo} · {c.split === "equal" ? "equal shares" : `pro-rata, cap ${c.cap_bps / 100}%`} · floor ${c.min_payout_usd} · {c.cut_hour_utc}:00 UTC
            </p>
            <p className="mt-1 text-[12px] text-ink">
              round {c.rounds_paid} of {c.days} · paid {fmtTok(paid, 5)} {c.token_symbol} ({usd(c.paid_usd)})
              {c.next_cut_at && c.status === "running" && <span className="text-ink-soft"> · next {new Date(c.next_cut_at).toLocaleString()}</span>}
            </p>
            <p className="mt-1 text-[11px] text-ink-soft">
              {c.fund_tx && (
                <a href={explorerTx(p.chainId, c.fund_tx)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                  funded
                </a>
              )}
              {c.end_tx && (
                <>
                  {" · "}
                  <a href={explorerTx(p.chainId, c.end_tx)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                    remainder returned
                  </a>
                </>
              )}
              {c.status === "draft" && " · signed but never funded; start a new one"}
            </p>
            {rounds.length > 0 && (
              <div className="mt-2 flex flex-col gap-0.5">
                {rounds.slice(0, 7).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[12px]">
                    <span className="w-8 text-ink-soft">#{r.round_no}</span>
                    <span className="text-ink-soft">{dateShort(r.cut_at)}</span>
                    <span className="flex-1 text-right text-ink">
                      {r.status === "paid" ? `${fmtTok(formatUnits(BigInt(r.paid_wei), c.token_decimals), 5)} ${c.token_symbol} to ${r.recipients}` : r.status === "skipped" ? `skipped · ${r.error ?? ""}` : r.status === "failed" ? `failed · ${r.error ?? ""}` : "pending"}
                    </span>
                    {r.tx_hash && (
                      <a href={explorerTx(p.chainId, r.tx_hash)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                        tx
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
