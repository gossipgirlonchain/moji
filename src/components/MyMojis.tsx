"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import type { MojiRow } from "@/lib/supabase";
import type { MojiFees } from "@/lib/fees";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { usd } from "@/lib/format";
import { feePct } from "@/config/fees";
import { ClaimButton } from "./FeesCard";
import { Button, Label } from "./ui";
import { MOJI_TREASURY } from "@/config/fees";

type Row = MojiRow & { fees: MojiFees };

export function MyMojis() {
  if (!PRIVY_ENABLED) return <p className="text-center text-[14px] text-ink-soft">login is off until NEXT_PUBLIC_PRIVY_APP_ID is set.</p>;
  return <MyMojisInner />;
}

function fmt(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function MyMojisInner() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [treasuryRows, setTreasuryRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isTreasury = Boolean(address && MOJI_TREASURY && address.toLowerCase() === MOJI_TREASURY.toLowerCase());

  useEffect(() => {
    if (!ready || !authenticated) return;
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/me/mojis${address ? `?address=${address}` : ""}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store" });
        const j = (await r.json()) as { mojis?: Row[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "failed");
        if (alive) setRows(j.mojis ?? []);
        if (isTreasury) {
          const rt = await fetch(`/api/me/mojis?as=treasury&address=${address}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store" });
          const jt = (await rt.json()) as { mojis?: Row[] };
          if (alive) setTreasuryRows(jt.mojis ?? []);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, authenticated, address, getAccessToken, isTreasury]);

  if (!ready) return <p className="text-center text-[14px] text-ink-soft">…</p>;
  if (!authenticated) {
    return (
      <Button size="lg" onClick={login}>
        Log in to see your mojis
      </Button>
    );
  }
  if (err) return <p className="text-center text-[14px] text-coral">{err}</p>;
  if (rows === null) return <p className="text-center text-[14px] text-ink-soft">loading…</p>;
  if (rows.length === 0 && !isTreasury) {
    return (
      <div className="clay pop flex flex-col items-center gap-3 bg-white p-6 text-center">
        <div className="text-[56px]">🫥</div>
        <p className="text-[14px] text-ink-soft">you haven&apos;t launched anything yet.</p>
        <Link href="/launch" className="press clay heading w-full bg-sky-500 px-6 py-3.5 text-[17px] text-white">
          launch a moji
        </Link>
      </div>
    );
  }

  const totalPending = rows.reduce((s, r) => s + r.fees.pendingUsd, 0);
  const totalClaimed = rows.reduce((s, r) => s + r.fees.claimedUsd, 0);

  return (
    <div className="flex flex-col gap-3">
      {isTreasury && treasuryRows && (
        <div className="flex flex-col gap-3">
          <Label>Treasury · 25% of every pool</Label>
          {treasuryRows.length === 0 && <p className="text-[13px] text-ink-soft">no pools yet.</p>}
          {treasuryRows.map((m) => (
            <section key={"t" + m.id} className="clay pop bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="text-[32px] leading-none">{m.display}</span>
                <div className="flex-1">
                  <div className="heading text-[16px] text-ink">{m.display} / {m.stock_ticker}</div>
                  <div className="text-[12px] text-ink-soft">{fmt(m.fees.pending.stock)} ${m.stock_ticker} · {fmt(m.fees.pending.moji)} {m.display}</div>
                </div>
                <div className="num text-[17px] text-mint">{usd(m.fees.pendingUsd)}</div>
              </div>
              <div className="mt-3">
                <ClaimButton compact beneficiary={MOJI_TREASURY} combo={m.display} ticker={m.stock_ticker} chainId={m.chain_id} tokenAddress={m.token_address} poolId={m.pool_id} creatorAddress={m.creator_address} pending={m.fees.pending} pendingUsd={m.fees.pendingUsd} claimedUsd={0} sources={m.fees.sources} schedule={m.fees.schedule} live={m.fees.live} />
              </div>
            </section>
          ))}
          {rows.length > 0 && <Label className="mt-2">Your launches</Label>}
        </div>
      )}
      <div className="clay pop grid grid-cols-2 gap-3 bg-sky-50 p-4 text-center">
        <div>
          <div className="num text-[26px] leading-none text-mint">{usd(totalPending)}</div>
          <div className="heading mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">unclaimed</div>
        </div>
        <div>
          <div className="num text-[26px] leading-none text-mint">{usd(totalClaimed)}</div>
          <div className="heading mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">claimed</div>
        </div>
      </div>

      {rows.map((m, i) => (
        <section key={m.id} className={`clay pop pop-${Math.min(5, i + 1)} bg-white p-4`}>
          <div className="flex items-center gap-3">
            <Link href={`/m/${encodeURIComponent(m.display)}`} className="text-[36px] leading-none">
              {m.display}
            </Link>
            <div className="flex-1">
              <Link href={`/m/${encodeURIComponent(m.display)}`} className="heading block text-[17px] text-ink">
                {m.display} / {m.stock_ticker}
              </Link>
              <div className="text-[12px] text-ink-soft">
                {m.token_address ? `fees ${fmt(m.fees.pending.stock)} $${m.stock_ticker} · ${fmt(m.fees.pending.moji)} ${m.display}` : "on-chain data pending"}
                {m.fees.schedule?.decaying && <span className="text-coral"> · fee {feePct(m.fees.schedule.currentFee)} → {feePct(m.fees.schedule.endFee)}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="num text-[17px] text-mint">{usd(m.fees.pendingUsd)}</div>
              <div className="heading text-[10px] uppercase tracking-[0.1em] text-ink-soft">unclaimed</div>
            </div>
          </div>
          <div className="mt-3">
            <ClaimButton
              compact
              combo={m.display}
              ticker={m.stock_ticker}
              chainId={m.chain_id}
              tokenAddress={m.token_address}
              poolId={m.pool_id}
              creatorAddress={m.creator_address}
              pending={m.fees.pending}
              pendingUsd={m.fees.pendingUsd}
              claimedUsd={m.fees.claimedUsd}
              sources={m.fees.sources}
              schedule={m.fees.schedule}
              live={m.fees.live}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
