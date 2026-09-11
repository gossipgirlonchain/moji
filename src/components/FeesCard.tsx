"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, type Address, type EIP1193Provider, type Hex } from "viem";
import { transportFor } from "@/lib/rpc";
import { DopplerSDK } from "@whetstone-research/doppler-sdk/evm";
import { Label } from "./ui";
import { chainById } from "@/config/chains";
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
  pendingStockUsd?: number;
  pendingMojiUsd?: number;
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
        {p.error ? "couldn't read the pool just now, retrying…" : p.live ? "read live from the pool" : "no on-chain data yet"}
      </p>
    </section>
  );
}

export function ClaimButton(p: FeesCardProps & { compact?: boolean; beneficiary?: string | null }) {
  const router = useRouter();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const running = useRef(false);
  const target = p.beneficiary ?? p.creatorAddress;
  const isCreator = Boolean(address && target && address.toLowerCase() === target.toLowerCase());
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0], [wallets]);
  const nothing = !p.sources.pool && !p.sources.hook;
  const wrongWallet = Boolean(p.beneficiary && address && !isCreator);

  async function run() {
    const chain = chainById(p.chainId);
    if (!wallet || !address || !chain?.viem || !p.tokenAddress) return;
    if (running.current) return; // ignore double taps before React re-renders the disabled state
    running.current = true;
    setErr(null);
    setNote(null);
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
      const hashes: Hex[] = [];
      let done = 0;
      const record = () =>
        hashes.length
          ? fetch(`/api/mojis/${encodeURIComponent(p.combo)}/claimed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHashes: hashes }) })
          : Promise.resolve();
      for (let i = 0; i < steps.length; i++) {
        setBusy(steps.length > 1 ? `sign ${i + 1} of ${steps.length}…` : "confirm in wallet…");
        try {
          const r = await steps[i].go();
          hashes.push(r.transactionHash);
          done++;
        } catch (e) {
          setBusy(null);
          if (done > 0) {
            setNote(`${done} of ${steps.length} done. tap Claim again to finish the rest.`);
            await record(); // what did land is still recorded from the receipts
          }
          throw e;
        }
      }
      await record();
      setBusy(null);
      router.refresh();
    } catch (e) {
      setBusy(null);
      setErr(friendly(e));
      router.refresh();
    } finally {
      running.current = false;
    }
  }

  const label = busy ?? (nothing ? "nothing to claim yet" : "Claim");
  return (
    <div>
      <button onClick={run} disabled={Boolean(busy) || nothing || !address || wrongWallet} className={`press clay heading w-full bg-sky-500 text-white disabled:opacity-60 ${p.compact ? "px-4 py-2.5 text-[14px]" : "px-5 py-3.5 text-[17px]"}`}>
        {label}
      </button>
      {!address && !nothing && <p className="mt-2 text-center text-[12px] text-ink-soft">log in to claim</p>}

      {note && <p className="mt-2 text-center text-[12px] text-ink">{note}</p>}
      {err && (
        <p className="clay-sm mt-2 bg-white px-3 py-2 text-center text-[12px] text-coral" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/** Wallet errors are long and ugly. Say what happened in one line. */
function friendly(e: unknown): string {
  const raw = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
  const m = raw.toLowerCase();
  if (m.includes("rejected") || m.includes("denied") || m.includes("cancel")) return "cancelled in your wallet.";
  if (m.includes("insufficient funds") || m.includes("gas")) return "not enough ETH on Robinhood Chain for gas.";
  if (m.includes("chain") && m.includes("switch")) return "switch your wallet to Robinhood Chain and try again.";
  return raw.split("\n")[0].slice(0, 90);
}
