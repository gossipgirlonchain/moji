"use client";

import { useRouter } from "next/navigation";
import { isXExempt } from "@/config/whitelist";
import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount, useBalance, useSignMessage } from "wagmi";
import { canonicalSponsorMessage } from "@/lib/sponsor-message";
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
import { updateMemeDetails, uploadMeme } from "@/lib/meme-client";
import { cleanMemeDetails, hasDetails, type MemeDetails } from "@/lib/meme-details";
import { MojiArt } from "@/components/MojiArt";
import type { LaunchKind } from "@/lib/meme-coin";

type Props = {
  chain: MojiChain;
  stock?: Stock;
  /** the claim: the emoji combo, or `$PEPE` for a meme */
  combo: string;
  available: boolean;
  curve: CurveDefaults;
  meme?: File | null;
  details?: MemeDetails;
  /** 'meme' launches a memecoin: `name` is the token name (title), `symbol` its ticker */
  kind?: LaunchKind;
  name?: string;
  symbol?: string;
  /** who earns the creator's fee share, when not the launcher */
  feeRecipient?: Address | null;
  /** developer buy in numeraire wei, bundled into the launch tx */
  devBuyIn?: bigint | null;
};

type Phase = "idle" | "pricing" | "signing" | "confirming" | "recording" | "done";

export function LaunchAction({ chain, stock, combo, available, curve, meme, details, kind = "moji", name, symbol, feeRecipient, devBuyIn }: Props) {
  const isMeme = kind === "meme";
  const tokenMeta = isMeme ? { name: name || combo, symbol: symbol || combo.slice(1) } : {};
  const extras = { feeRecipient: feeRecipient ?? undefined, devBuyIn: devBuyIn && devBuyIn > 0n ? devBuyIn : undefined };
  const router = useRouter();
  const { ready, authenticated, user, login, linkTwitter, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [phase, setPhase] = useState<Phase>("idle");
  // Robinhood Chain: moji pays the gas. The sponsor wallet sends the launch; the user only signs a message.
  // A developer buy cannot ride along (the Bundler pulls the stock from the tx sender), so those launches are self-sent.
  const [sponsorOpen, setSponsorOpen] = useState(false);
  useEffect(() => {
    if (chain.chainId !== 4663) {
      setSponsorOpen(false);
      return;
    }
    let alive = true;
    fetch("/api/launch/sponsored", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { open?: boolean }) => alive && setSponsorOpen(Boolean(j.open)))
      .catch(() => alive && setSponsorOpen(false));
    return () => {
      alive = false;
    };
  }, [chain.chainId]);
  const sponsored = sponsorOpen && !extras.devBuyIn;
  const [error, setError] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [done, setDone] = useState<{ href: string; url: string; combo: string; ticker: string; ca: string; memeUrl: string | null; memeError: string | null; bought?: bigint } | null>(null);
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
        const g = await estimateLaunchGasWei({ chain, stock, combo, ...tokenMeta, ...extras, creator: address as Address, provider, curve, stockPriceUsd: price });
        if (alive) setGasEstimate(g);
      } catch {}
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, stock, available, wallet, chain, combo, curve, tokenMeta.name, tokenMeta.symbol, extras.feeRecipient, extras.devBuyIn]);

  const ok = Boolean(stock && available && combo);

  async function onLaunch() {
    if (!wallet || !address || !stock || !chain.viem) return;
    setError(null);
    try {
      let res: { tokenAddress: string; devBuyOut?: bigint };
      let j: { href?: string; url?: string; error?: string };
      const token = await getAccessToken();
      if (sponsored) {
        // moji pays the gas: sign the launch message, the server sends the create and records it in one go.
        setPhase("signing");
        const ts = Date.now();
        const message = canonicalSponsorMessage({ creator: address, combo, pair: stock.address, chainId: chain.chainId, ts, name: isMeme ? tokenMeta.name : null, feeRecipient: extras.feeRecipient ?? null });
        const signature = await signMessageAsync({ message });
        setPhase("confirming");
        const r = await fetch("/api/launch/sponsored", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            combo,
            ...(isMeme ? { kind: "meme", name: tokenMeta.name, symbol: tokenMeta.symbol } : {}),
            ...(extras.feeRecipient ? { feeRecipient: extras.feeRecipient } : {}),
            pair: stock.address,
            chainId: chain.chainId,
            creator: address,
            ts,
            signature,
            mcap: curve.mcapStart,
          }),
        });
        j = (await r.json()) as { href?: string; url?: string; error?: string; moji?: { token_address?: string } };
        if (!r.ok) throw new Error(j.error ?? "Sponsored launch failed");
        res = { tokenAddress: (j as { moji?: { token_address?: string } }).moji?.token_address ?? "" };
      } else {
        setPhase("pricing");
        const provider = await ensureChain(wallet, chain.viem);
        const price = await stockPriceUsd(stock);

        setPhase("signing");
        const launched = await launchMoji({ chain, stock, combo, ...tokenMeta, ...extras, creator: address as Address, provider, curve, stockPriceUsd: price });
        res = launched;

        setPhase("recording");
        const r = await fetch("/api/launch", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            combo,
            ...(isMeme ? { kind: "meme", name: tokenMeta.name, symbol: tokenMeta.symbol } : {}),
            ...(extras.feeRecipient ? { feeRecipient: extras.feeRecipient } : {}),
            chainId: chain.chainId,
            stockAddress: stock.address,
            tokenAddress: launched.tokenAddress,
            poolId: launched.poolId,
            txHash: launched.txHash,
            supply: launched.supply,
            creatorAddress: address,
          }),
        });
        j = (await r.json()) as { href?: string; url?: string; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Could not record launch");
      }
      // The picture rides along after the row exists (creator-only upload). Best effort: the token page can add it later.
      let memeUrl: string | null = null;
      let memeError: string | null = null;
      const memeTarget = { combo, chainId: chain.chainId, pair: stock.address };
      if (meme) {
        try {
          memeUrl = await uploadMeme(memeTarget, meme, token ? { token } : null);
        } catch (e) {
          memeError = e instanceof Error ? e.message : "meme upload failed";
        }
      }
      // The words and links ride along the same way; the moji page can fix them later.
      if (hasDetails(details)) {
        const clean = cleanMemeDetails(details);
        try {
          if (!clean.ok) throw new Error(clean.error);
          await updateMemeDetails(memeTarget, clean.details, token ? { token } : null);
        } catch (e) {
          memeError = memeError ?? (e instanceof Error ? e.message : "details not saved");
        }
      }
      setPhase("done");
      const href = j.href ?? `/m/${encodeURIComponent(combo)}`;
      setDone({ href, url: j.url ?? `${SITE_URL}${href}`, combo, ticker: stock.ticker, ca: res.tokenAddress, memeUrl, memeError, bought: res.devBuyOut });
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

  const preview = ok ? `${combo} / ${stock!.ticker}` : isMeme ? "pick a pair, a title, a ticker and a picture" : "pick a stock and an emoji";

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
        {done.memeUrl ? <MojiArt m={{ display: done.combo, meme_url: done.memeUrl }} size={200} radius={24} /> : <div className="wobble text-[64px] leading-none">{done.combo}</div>}
        <p className="heading text-[22px] text-ink">
          {isMeme && tokenMeta.name ? `${tokenMeta.name} · ` : ""}
          {done.combo} / {done.ticker} is live.
        </p>
        {done.bought && done.bought > 0n ? <p className="text-[13px] text-ink-soft">and you bought {Number(formatEther(done.bought)).toLocaleString(undefined, { maximumFractionDigits: 0 })} {done.combo} in the same transaction.</p> : null}
        {done.memeError && <p className="text-[12px] text-coral">picture not saved ({done.memeError}). add it from your {isMeme ? "meme" : "moji"} page.</p>}
        <PostIt combo={done.combo} ticker={done.ticker} url={done.url} ca={done.ca} size="lg" />
        <Link href={done.href} className="press clay heading block w-full bg-sky-500 px-6 py-3.5 text-[17px] text-white">
          view your {isMeme ? "meme" : "moji"}
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
    ? { pricing: "Pricing…", signing: extras.devBuyIn ? "Sign in your wallet (approval, then launch)…" : "Sign in your wallet…", confirming: "Confirming…", recording: isMeme ? "Claiming ticker…" : "Claiming combo…", done: "Launched!" }[phase]
    : !hasGas && address && !sponsored
      ? "Not enough gas"
      : `LAUNCH ${preview}`;

  return (
    <div className="flex flex-col gap-4">
      {address && !hasGas && !sponsored && (
        <FundWalletCard
          address={address}
          chain={chain}
          balance={Number(formatEther(balance)).toFixed(5)}
          needed={Number(formatEther(needed)).toFixed(5)}
        />
      )}
      <Button size="lg" onClick={onLaunch} disabled={!ok || (!hasGas && !sponsored) || busy} className="pop pop-4">
        {label}
      </Button>
      {sponsored && <p className="-mt-2 text-center text-[12px] text-mint">gas is on moji on Robinhood Chain. one signature, no ETH needed.</p>}
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
