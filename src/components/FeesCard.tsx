"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, http, type Address, type EIP1193Provider, type Hex } from "viem";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import { Label } from "./ui";
import { chainById } from "@/config/chains";
import { feePct } from "@/config/fees";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { rehypeHookAddress } from "@/lib/doppler";
import { usd } from "@/lib/format";

export type FeesCardProps = {
  combo: string;
  ticker: string;
  chainId: number;
  tokenAddress: string | null;
  poolId: string | null;
  creatorAddress: string | null;
  pending: { stock: number; moji: number };
  pendingUsd: number;
  claimedUsd: number;
  sources: { pool: boolean; hook: boolean };
  schedule: { startFee: number; endFee: number; currentFee: number; startingTime: number; durationSeconds: number; decaying: boolean } | null;
  live: boolean;
};

function fmt(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function FeesCard(p: FeesCardProps) {
  return (
    <section className="clay pop pop-2 bg-sky-50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <Label>Your fees</Label>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            paid in <b className="text-ink">${p.ticker}</b> and <b className="text-ink">{p.combo}</b>
          </p>
        </div>
        <FeeRate schedule={p.schedule} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="clay-sm bg-white p-4 text-center">
          <div className="num text-[26px] leading-none text-mint">{fmt(p.pending.stock)}</div>
          <div className="heading mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">${p.ticker} unclaimed</div>
        </div>
        <div className="clay-sm bg-white p-4 text-center">
          <div className="num text-[26px] leading-none text-mint">{fmt(p.pending.moji)}</div>
          <div className="heading mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">{p.combo} unclaimed</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-[13px]">
        <span className="text-ink-soft">
          unclaimed <span className="num text-mint">{usd(p.pendingUsd)}</span>
        </span>
        <span className="text-ink-soft">
          claimed <span className="num text-mint">{usd(p.claimedUsd)}</span>
        </span>
      </div>

      <div className="mt-4">{PRIVY_ENABLED && p.tokenAddress ? <ClaimButton {...p} /> : <ClaimDisabled tokenAddress={p.tokenAddress} />}</div>
      <p className="mt-2 text-center text-[11px] text-ink-soft">
        {p.live ? "read live from the pool" : "no on-chain data yet"} · creator 70% · moji treasury 25% · Doppler 5%
      </p>
    </section>
  );
}

function FeeRate({ schedule }: { schedule: FeesCardProps["schedule"] }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!schedule?.decaying) return;
    const t = setInterval(() => setNow(Date.now() / 1000), 5000);
    return () => clearInterval(t);
  }, [schedule?.decaying]);
  if (!schedule) return null;
  const fee = (() => {
    const s = schedule;
    if (s.durationSeconds <= 0 || now >= s.startingTime + s.durationSeconds) return s.endFee;
    if (now <= s.startingTime) return s.startFee;
    return Math.round(s.startFee - (s.startFee - s.endFee) * ((now - s.startingTime) / s.durationSeconds));
  })();
  const decaying = fee > schedule.endFee;
  return (
    <span className={`clay-pill heading shrink-0 px-3 py-1.5 text-[12px] ${decaying ? "bg-coral text-white" : "bg-white text-ink"}`} title={decaying ? "swap fee decaying" : "terminal swap fee"}>
      fee {feePct(fee)}
      {decaying && <> → {feePct(schedule.endFee)}</>}
    </span>
  );
}

function ClaimDisabled({ tokenAddress }: { tokenAddress: string | null }) {
  return (
    <button disabled className="press clay heading w-full bg-sky-500 px-5 py-3.5 text-[17px] text-white opacity-60">
      {tokenAddress ? "Claim" : "nothing to claim yet"}
    </button>
  );
}

export function ClaimButton(p: FeesCardProps & { compact?: boolean }) {
  const router = useRouter();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isCreator = Boolean(address && p.creatorAddress && address.toLowerCase() === p.creatorAddress.toLowerCase());
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0], [wallets]);
  const nothing = !p.sources.pool && !p.sources.hook;

  async function run() {
    const chain = chainById(p.chainId);
    if (!wallet || !address || !chain?.viem || !p.tokenAddress) return;
    setErr(null);
    try {
      await wallet.switchChain(chain.chainId);
      const provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
      const publicClient = createPublicClient({ chain: chain.viem, transport: http() });
      const walletClient = createWalletClient({ chain: chain.viem, account: address as Address, transport: custom(provider) });
      const sdk = new DopplerSDK({ publicClient, walletClient, chainId: chain.viem.id });
      const steps: { label: string; go: () => Promise<{ transactionHash: Hex }> }[] = [];

      if (p.sources.pool) {
        // MulticurvePool.collectFees(): anyone can call, payout routes to the locked beneficiaries.
        const pool = await sdk.getMulticurvePool(p.tokenAddress as Address);
        steps.push({ label: "pool fees", go: () => pool.collectFees() });
      }
      if (p.sources.hook && p.poolId) {
        const hook = await sdk.getRehypeDopplerHookInitializer(rehypeHookAddress(p.chainId));
        steps.push(
          isCreator
            ? { label: "hook fees", go: () => hook.claimFees(p.poolId as Hex) } // collect + release caller's share
            : { label: "hook fees", go: () => hook.collectFees(p.tokenAddress as Address) }, // collect for beneficiaries
        );
      }
      if (steps.length === 0) return;
      let last: Hex | null = null;
      for (let i = 0; i < steps.length; i++) {
        setBusy(steps.length > 1 ? `${steps[i].label} ${i + 1}/${steps.length}…` : "confirm in wallet…");
        const r = await steps[i].go();
        last = r.transactionHash;
      }
      if (last) {
        await fetch(`/api/mojis/${encodeURIComponent(p.combo)}/claimed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txHash: last, amountUsd: p.pendingUsd }),
        });
      }
      setBusy(null);
      router.refresh();
    } catch (e) {
      setBusy(null);
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.length > 200 ? msg.slice(0, 200) + "…" : msg);
    }
  }

  const label = busy ?? (nothing ? "nothing to claim yet" : isCreator ? "Claim" : "Distribute fees");
  return (
    <div>
      <button onClick={run} disabled={Boolean(busy) || nothing || !address} className={`press clay heading w-full bg-sky-500 text-white disabled:opacity-60 ${p.compact ? "px-4 py-2.5 text-[14px]" : "px-5 py-3.5 text-[17px]"}`}>
        {label}
      </button>
      {!address && !nothing && <p className="mt-2 text-center text-[12px] text-ink-soft">log in to {isCreator ? "claim" : "distribute"}</p>}
      {err && (
        <p className="clay-sm mt-2 bg-white px-3 py-2 text-center text-[12px] text-coral" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
