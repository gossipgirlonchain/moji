"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, type Address, type EIP1193Provider, type Hex } from "viem";
import { transportFor } from "@/lib/rpc";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import { Label } from "./ui";
import { chainById } from "@/config/chains";
import { feePct } from "@/config/fees";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { rehypeHookAddress } from "@/lib/doppler";

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
  error?: string;
};

type FeesPayload = Pick<FeesCardProps, "pending" | "pendingUsd" | "claimedUsd" | "sources" | "schedule" | "live" | "error">;

/**
 * Keeps the numbers fresh: refetches from /api/mojis/[combo]/fees on mount and every 20s,
 * so a transient RPC failure on the server render heals itself instead of sticking at 0.
 */
function useLiveFees(initial: FeesCardProps): FeesCardProps {
  const [state, setState] = useState<FeesCardProps>(initial);
  useEffect(() => {
    if (!initial.tokenAddress) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/mojis/${encodeURIComponent(initial.combo)}/fees`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { fees: FeesPayload };
        if (alive && j.fees) setState((s) => ({ ...s, ...j.fees }));
      } catch {}
    };
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [initial.combo, initial.tokenAddress]);
  return state;
}

function fmt(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function FeesCard(initial: FeesCardProps) {
  const p = useLiveFees(initial);
  const { address } = useAccount();
  const isCreator = Boolean(address && p.creatorAddress && address.toLowerCase() === p.creatorAddress.toLowerCase());
  return (
    <section className="clay pop pop-2 bg-sky-50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <Label>{isCreator ? "Your fees" : "Creator fees"}</Label>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            paid in <b className="text-ink">${p.ticker}</b> and <b className="text-ink">{p.combo}</b>
          </p>
        </div>
        <FeeRate schedule={p.schedule} />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div className="clay-sm flex items-baseline justify-between bg-white px-5 py-4">
          <span className="num text-[34px] leading-none text-mint">{fmt(p.pending.stock)}</span>
          <span className="heading text-[15px] text-ink">{p.ticker} <span className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">unclaimed</span></span>
        </div>
        <div className="clay-sm flex items-baseline justify-between bg-white px-5 py-4">
          <span className="num text-[34px] leading-none text-mint">{fmt(p.pending.moji)}</span>
          <span className="heading text-[15px] text-ink">{p.combo} <span className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">unclaimed</span></span>
        </div>
      </div>

      {isCreator && PRIVY_ENABLED && p.tokenAddress && (
        <div className="mt-4">
          <ClaimButton {...p} />
        </div>
      )}
      <p className={`mt-2 text-center text-[11px] ${p.error ? "text-coral" : "text-ink-soft"}`}>
        {p.error ? "couldn't read the pool just now, retrying…" : p.live ? "read live from the pool" : "no on-chain data yet"} · creator 70% · moji treasury 25% · Doppler 5%
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

export function ClaimButton(p: FeesCardProps & { compact?: boolean; beneficiary?: string | null }) {
  const router = useRouter();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const target = p.beneficiary ?? p.creatorAddress;
  const isCreator = Boolean(address && target && address.toLowerCase() === target.toLowerCase());
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0], [wallets]);
  const nothing = !p.sources.pool && !p.sources.hook;

  async function run() {
    const chain = chainById(p.chainId);
    if (!wallet || !address || !chain?.viem || !p.tokenAddress) return;
    setErr(null);
    try {
      await wallet.switchChain(chain.chainId);
      const provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
      const publicClient = createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) });
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

  const label = busy ?? (nothing ? "nothing to claim yet" : "Claim");
  return (
    <div>
      <button onClick={run} disabled={Boolean(busy) || nothing || !address} className={`press clay heading w-full bg-sky-500 text-white disabled:opacity-60 ${p.compact ? "px-4 py-2.5 text-[14px]" : "px-5 py-3.5 text-[17px]"}`}>
        {label}
      </button>
      {!address && !nothing && <p className="mt-2 text-center text-[12px] text-ink-soft">log in to claim</p>}

      {err && (
        <p className="clay-sm mt-2 bg-white px-3 py-2 text-center text-[12px] text-coral" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
