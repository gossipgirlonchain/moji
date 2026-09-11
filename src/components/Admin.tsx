"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import type { MojiRow } from "@/lib/supabase";
import type { MojiFees } from "@/lib/fees";
import type { Market } from "@/lib/market";
import { MOJI_TREASURY, feePct } from "@/config/fees";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { short, usd } from "@/lib/format";
import { explorerAddress } from "@/lib/links";
import { Button, Card, Label } from "./ui";
import { CopyButton } from "./CopyButton";
import { ClaimButton } from "./FeesCard";

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

type Pool = MojiRow & { fees: MojiFees; market: Market };
type Payload = { treasury: string; pools: Pool[]; totals: { pendingUsd: number; mcap: number; claimable: number }; count: number };

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
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <TreasuryWallet />
      {err && <p className="text-center text-[13px] text-coral">{err}</p>}
      {!data ? (
        <p className="text-center text-[14px] text-ink-soft">reading every pool…</p>
      ) : (
        <>
          <Card tone="sky" pop={1}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="num text-[24px] leading-none text-ink">{data.count}</div>
                <div className="heading mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">pools</div>
              </div>
              <div>
                <div className="num text-[24px] leading-none text-mint">{usd(data.totals.pendingUsd)}</div>
                <div className="heading mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">treasury unclaimed</div>
              </div>
              <div>
                <div className="num text-[24px] leading-none text-ink">{usd(data.totals.mcap)}</div>
                <div className="heading mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">total mcap</div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-ink-soft">{data.totals.claimable} pools with something to claim · usd is an estimate, the tokens are exact</p>
          </Card>

          {data.pools.map((p, i) => (
            <section key={p.id} className={`clay pop pop-${Math.min(5, (i % 5) + 1)} bg-white p-4`}>
              <div className="flex items-center gap-3">
                <Link href={`/m/${encodeURIComponent(p.display)}`} className="text-[34px] leading-none">
                  {p.display}
                </Link>
                <div className="flex-1">
                  <Link href={`/m/${encodeURIComponent(p.display)}`} className="heading block text-[16px] text-ink">
                    {p.display} / {p.stock_ticker}
                  </Link>
                  <div className="text-[12px] text-ink-soft">
                    mcap {usd(p.market.marketCapUsd)} · by {p.creator_handle ? `@${p.creator_handle}` : short(p.creator_address)}
                    {p.fees.schedule && (
                      <span className={p.fees.schedule.decaying ? "text-coral" : ""}>
                        {" "}· fee {feePct(p.fees.schedule.currentFee)}
                        {p.fees.schedule.decaying ? ` → ${feePct(p.fees.schedule.endFee)}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="num text-[15px] text-mint">{usd(p.fees.pendingUsd)}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="clay-sm bg-sky-50 px-3 py-2.5 text-center">
                  <div className="num text-[20px] leading-none text-mint">{fmt(p.fees.pending.stock)}</div>
                  <div className="heading mt-1 text-[11px] text-ink">{p.stock_ticker}</div>
                </div>
                <div className="clay-sm bg-sky-50 px-3 py-2.5 text-center">
                  <div className="num text-[20px] leading-none text-mint">{fmt(p.fees.pending.moji)}</div>
                  <div className="heading mt-1 text-[11px] text-ink">{p.display}</div>
                </div>
              </div>
              {p.fees.error && <p className="mt-2 text-center text-[11px] text-coral">read failed, retrying</p>}
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
                  claimedUsd={0}
                  sources={p.fees.sources}
                  schedule={p.fees.schedule}
                  live={p.fees.live}
                />
              </div>
            </section>
          ))}
        </>
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

function TreasuryWallet() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const isTreasury = Boolean(address && MOJI_TREASURY && address.toLowerCase() === MOJI_TREASURY.toLowerCase());
  if (!PRIVY_ENABLED) return null;
  return (
    <Card pop={0}>
      <Label>Treasury wallet</Label>
      <div className="mt-1 flex items-center justify-between gap-2">
        <a href={explorerAddress(4663, MOJI_TREASURY)} target="_blank" rel="noopener noreferrer" className="mono text-[13px] text-sky-600">
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
