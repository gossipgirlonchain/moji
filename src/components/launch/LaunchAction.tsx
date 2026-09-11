"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount, useBalance } from "wagmi";
import { formatEther, parseEther, type Address, type EIP1193Provider } from "viem";
import { Button } from "@/components/ui";
import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import type { CurveDefaults } from "@/config/curve";
import { estimateLaunchGasWei, launchMoji } from "@/lib/doppler";
import { stockPriceUsd } from "@/lib/price";
import { FundWalletCard } from "./FundWallet";
import { PostIt } from "@/components/PostIt";
import Link from "next/link";
import { SITE_URL } from "@/lib/network";

type Props = { chain: MojiChain; stock?: Stock; combo: string; available: boolean; curve: CurveDefaults };

type Phase = "idle" | "pricing" | "signing" | "confirming" | "recording" | "done";

export function LaunchAction({ chain, stock, combo, available, curve }: Props) {
  const router = useRouter();
  const { ready, authenticated, user, login, linkTwitter, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [done, setDone] = useState<{ href: string; url: string; combo: string; ticker: string } | null>(null);
  const hasX = Boolean(user?.twitter?.username);

  const wallet = useMemo(() => wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0], [wallets]);
  // Only pick a default once; never override a wallet the user switched to.
  useEffect(() => {
    if (wallet && authenticated && !address) void setActiveWallet(wallet);
  }, [wallet, authenticated, address, setActiveWallet]);

  const chainId = chain.viem?.id ?? chain.chainId;
  const { data: bal, refetch } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  // Gas threshold: simulated estimate when we can get one, else the chain's floor.
  const floor = parseEther(chain.minGasNative);
  const needed = gasEstimate && gasEstimate > floor ? gasEstimate : floor;
  const balance = bal?.value ?? 0n;
  const hasGas = balance >= needed;

  // Simulate once everything is chosen (best effort, silent on failure).
  useEffect(() => {
    let alive = true;
    setGasEstimate(null);
    if (!address || !stock || !available || !wallet || !chain.viem) return;
    (async () => {
      try {
        const provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
        const price = await stockPriceUsd(stock);
        const g = await estimateLaunchGasWei({ chain, stock, combo, creator: address as Address, provider, curve, stockPriceUsd: price });
        if (alive) setGasEstimate(g);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [address, stock, available, wallet, chain, combo, curve]);

  const ok = Boolean(stock && available && combo);

  async function onLaunch() {
    if (!wallet || !address || !stock || !chain.viem) return;
    setError(null);
    try {
      setPhase("pricing");
      await wallet.switchChain(chainId);
      const provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
      const price = await stockPriceUsd(stock);

      setPhase("signing");
      const res = await launchMoji({ chain, stock, combo, creator: address as Address, provider, curve, stockPriceUsd: price });

      setPhase("recording");
      const token = await getAccessToken();
      const r = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          combo,
          chainId: chain.chainId,
          stockAddress: stock.address,
          tokenAddress: res.tokenAddress,
          poolId: res.poolId,
          txHash: res.txHash,
          supply: res.supply,
          creatorAddress: address,
        }),
      });
      const j = (await r.json()) as { href?: string; url?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not record launch");
      setPhase("done");
      const href = j.href ?? `/m/${encodeURIComponent(combo)}`;
      setDone({ href, url: j.url ?? `${SITE_URL}${href}`, combo, ticker: stock.ticker });
      router.prefetch(href);
    } catch (e) {
      setPhase("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.length > 220 ? msg.slice(0, 220) + "…" : msg);
      void refetch();
    }
  }

  const preview = ok ? `${combo} / ${stock!.ticker}` : "pick a stock and an emoji";

  if (!ready) return <Button disabled size="lg">…</Button>;

  if (!authenticated) {
    return (
      <Button size="lg" onClick={login}>
        Log in to launch
      </Button>
    );
  }

  if (done) {
    return (
      <div className="clay pop flex flex-col items-center gap-3 bg-white p-5 text-center">
        <div className="wobble text-[64px] leading-none">{done.combo}</div>
        <p className="heading text-[22px] text-ink">
          {done.combo} / {done.ticker} is yours. forever.
        </p>
        <PostIt combo={done.combo} ticker={done.ticker} url={done.url} size="lg" />
        <Link href={done.href} className="press clay heading block w-full bg-sky-500 px-6 py-3.5 text-[17px] text-white">
          view your moji
        </Link>
      </div>
    );
  }

  // X is required to claim. Wallet-only users can browse and trade, not launch.
  if (!hasX) {
    return (
      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={linkTwitter} className="pop pop-4">
          Link X to claim
        </Button>
        <p className="text-center text-[12px] text-ink-soft">claims need an X account. one claim per account per hour.</p>
      </div>
    );
  }

  const busy = phase !== "idle";
  const label = busy
    ? { pricing: "Pricing…", signing: "Sign in your wallet…", confirming: "Confirming…", recording: "Claiming combo…", done: "Launched!" }[phase]
    : !hasGas && address
      ? "Not enough gas"
      : `LAUNCH ${preview}`;

  return (
    <div className="flex flex-col gap-4">
      {address && !hasGas && (
        <FundWalletCard
          address={address}
          chain={chain}
          balance={Number(formatEther(balance)).toFixed(5)}
          needed={Number(formatEther(needed)).toFixed(5)}
        />
      )}
      <Button size="lg" onClick={onLaunch} disabled={!ok || !hasGas || busy} className="pop pop-4">
        {label}
      </Button>
      {error && (
        <p className="clay-sm bg-white px-4 py-3 text-center text-[13px] text-coral" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function LaunchActionDisabled({ combo, stock, available }: { combo: string; stock?: Stock; available: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" disabled className="pop pop-4">
        {combo && stock && available ? `LAUNCH ${combo} / ${stock.ticker}` : combo && !available ? "that combo is taken" : "pick a stock and an emoji"}
      </Button>
      <p className="text-center text-[12px] text-ink-soft">login is off until NEXT_PUBLIC_PRIVY_APP_ID is set.</p>
    </div>
  );
}
