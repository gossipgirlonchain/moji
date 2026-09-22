"use client";

import { useRouter } from "next/navigation";
import { isXExempt } from "@/config/whitelist";
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
import { ensureChain, pickWallet } from "@/lib/wallet";
import { PostIt } from "@/components/PostIt";
import Link from "next/link";
import { SITE_URL } from "@/lib/network";
import { uploadMeme } from "@/lib/meme-client";
import { memeCombo, memeDisplay, memeMetaUrl } from "@/lib/memecoin";
import type { MemeDraft } from "./MemeFields";
import { MojiArt } from "@/components/MojiArt";

type Props = { chain: MojiChain; stock?: Stock; combo: string; available: boolean; curve: CurveDefaults; kind?: "moji" | "meme"; meme?: MemeDraft | null };

type Phase = "idle" | "pricing" | "signing" | "confirming" | "recording" | "done";

export function LaunchAction({ chain, stock, combo: comboProp, available, curve, kind = "moji", meme }: Props) {
  // What goes on chain as name/symbol: the combo for a moji, the ticker (and title) for a meme.
  const isMeme = kind === "meme" && Boolean(meme);
  const combo = isMeme ? memeDisplay(meme!.symbol) : comboProp;
  const token = useMemo(
    () => (isMeme && stock ? { name: meme!.name.trim(), symbol: meme!.symbol, tokenURI: memeMetaUrl(SITE_URL, meme!.symbol, chain.chainId, stock.address) } : undefined),
    [isMeme, meme, stock, chain.chainId],
  );
  const router = useRouter();
  const { ready, authenticated, user, login, linkTwitter, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [done, setDone] = useState<{ href: string; url: string; combo: string; ticker: string; ca: string; memeUrl: string | null; memeError: string | null } | null>(null);
  const hasX = Boolean(user?.twitter?.username) || isXExempt(address);
  // Dead-moji cap: ask the server whether this account may launch right now.
  const [quota, setQuota] = useState<{ blocked: boolean; message: string | null; dead: number; max: number } | null>(null);
  useEffect(() => {
    if (!authenticated) {
      setQuota(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch("/api/claims/quota", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
        if (r.ok && alive) setQuota(await r.json());
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [authenticated, getAccessToken, done]);

  const wallet = useMemo(() => pickWallet(wallets), [wallets]);
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
        const g = await estimateLaunchGasWei({ chain, stock, combo, token, creator: address as Address, provider, curve, stockPriceUsd: price });
        if (alive) setGasEstimate(g);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [address, stock, available, wallet, chain, combo, token, curve]);

  const ok = Boolean(stock && available && combo && (!isMeme || (meme?.file && token)));

  async function onLaunch() {
    if (!wallet || !address || !stock || !chain.viem) return;
    setError(null);
    try {
      setPhase("pricing");
      const provider = await ensureChain(wallet, chain.viem);
      const price = await stockPriceUsd(stock);

      setPhase("signing");
      const res = await launchMoji({ chain, stock, combo, token, creator: address as Address, provider, curve, stockPriceUsd: price });

      setPhase("recording");
      const accessToken = await getAccessToken();
      const r = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({
          combo,
          ...(token ? { kind: "meme", name: token.name, symbol: token.symbol } : {}),
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
      // A meme's picture rides along after the row exists (creator-only upload). Best effort: the meme page can add it later.
      let memeUrl: string | null = null;
      let memeError: string | null = null;
      if (isMeme && meme?.file) {
        try {
          memeUrl = await uploadMeme({ combo: memeCombo(chain.chainId, stock.address, meme.symbol), chainId: chain.chainId, pair: stock.address }, meme.file, accessToken ? { token: accessToken } : null);
        } catch (e) {
          memeError = e instanceof Error ? e.message : "picture upload failed";
        }
      }
      setPhase("done");
      const href = j.href ?? `/m/${encodeURIComponent(combo)}`;
      setDone({ href, url: j.url ?? `${SITE_URL}${href}`, combo, ticker: stock.ticker, ca: res.tokenAddress, memeUrl, memeError });
      router.prefetch(href);
    } catch (e) {
      setPhase("idle");
      const raw = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
      const m = raw.toLowerCase();
      const msg = m.includes("does not match the target chain") || m.includes("chain mismatch")
        ? `your wallet is on the wrong network. switch it to ${chain.name} and tap launch again.`
        : m.includes("rejected") || m.includes("denied")
          ? "cancelled in your wallet."
          : m.includes("insufficient funds")
            ? `not enough ${chain.gasSymbol} on ${chain.name} for gas.`
            : raw.split("\n")[0].slice(0, 220);
      setError(msg);
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
        {done.memeUrl ? <MojiArt m={{ display: done.combo, meme_url: done.memeUrl, kind: "meme" }} size={200} radius={24} /> : <div className="wobble text-[64px] leading-none">{done.combo}</div>}
        <p className="heading text-[22px] text-ink">
          {done.combo} / {done.ticker} is live.
        </p>
        {done.memeError && <p className="text-[12px] text-coral">picture not saved ({done.memeError}). add it from your meme page.</p>}
        <PostIt combo={done.combo} ticker={done.ticker} url={done.url} ca={done.ca} size="lg" />
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
        <p className="text-center text-[12px] text-ink-soft">claims need an X account. one claim per account every 15 minutes.</p>
      </div>
    );
  }

  if (quota?.blocked) {
    return (
      <div className="flex flex-col gap-2">
        <Button size="lg" disabled className="pop pop-4 opacity-60">
          LAUNCH {preview}
        </Button>
        <p className="text-center text-[13px] text-coral">{quota.message}</p>
      </div>
    );
  }

  const busy = phase !== "idle";
  const label = busy
    ? { pricing: "Pricing…", signing: "Sign in your wallet…", confirming: "Confirming…", recording: isMeme ? "Recording…" : "Claiming combo…", done: "Launched!" }[phase]
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
        {combo && stock && available ? `LAUNCH ${combo} / ${stock.ticker}` : combo && !available ? "not ready yet" : "pick a stock and an emoji"}
      </Button>
      <p className="text-center text-[12px] text-ink-soft">login is off until NEXT_PUBLIC_PRIVY_APP_ID is set.</p>
    </div>
  );
}
