"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount, useBalance, usePublicClient, useReadContracts, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, formatUnits, isAddress, parseEther, parseUnits, type Address } from "viem";
import { DEFAULT_CHAIN } from "@/config/chains";
import { findStock } from "@/config/stocks";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { explorerTx } from "@/lib/links";
import { short } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { Button, Card, Label } from "./ui";
import type { MojiRow } from "@/lib/supabase";

export function Profile() {
  if (!PRIVY_ENABLED) return <p className="text-center text-[14px] text-ink-soft">login is off until NEXT_PUBLIC_PRIVY_APP_ID is set.</p>;
  return <ProfileInner />;
}

type Asset = { key: string; symbol: string; address?: Address; decimals: number; label: string };

function ProfileInner() {
  const chain = DEFAULT_CHAIN;
  const chainId = chain.viem!.id;
  const { ready, authenticated, user, login, logout, linkTwitter, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0], [wallets]);
  useEffect(() => {
    if (wallet && authenticated) void setActiveWallet(wallet);
  }, [wallet, authenticated, setActiveWallet]);

  const { data: eth, refetch: refetchEth } = useBalance({ address, chainId, query: { enabled: Boolean(address), refetchInterval: 12_000 } });

  // Tokens this user's mojis pay fees in: each stock token + each moji token.
  const [mojis, setMojis] = useState<MojiRow[] | null>(null);
  useEffect(() => {
    if (!ready || !authenticated) return;
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/me/mojis?light=1${address ? `&address=${address}` : ""}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store" });
        const j = (await r.json()) as { mojis?: MojiRow[] };
        if (alive) setMojis(j.mojis ?? []);
      } catch {
        if (alive) setMojis([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, authenticated, address, getAccessToken]);

  const tokenAssets = useMemo<Asset[]>(() => {
    const seen = new Map<string, Asset>();
    for (const m of mojis ?? []) {
      if (m.chain_id !== chainId) continue;
      const stock = findStock(m.chain_id, m.stock_address);
      if (stock && !seen.has(stock.address.toLowerCase())) seen.set(stock.address.toLowerCase(), { key: stock.address.toLowerCase(), symbol: stock.ticker, address: stock.address, decimals: stock.decimals, label: `$${stock.ticker}` });
      if (m.token_address && !seen.has(m.token_address.toLowerCase())) seen.set(m.token_address.toLowerCase(), { key: m.token_address.toLowerCase(), symbol: m.display, address: m.token_address as Address, decimals: 18, label: m.display });
    }
    return [...seen.values()];
  }, [mojis, chainId]);

  const { data: tokenBalances, refetch: refetchTokens } = useReadContracts({
    contracts: tokenAssets.map((t) => ({ address: t.address!, abi: erc20Abi, functionName: "balanceOf" as const, args: [address ?? "0x0000000000000000000000000000000000000000"] as const, chainId })),
    query: { enabled: Boolean(address) && tokenAssets.length > 0, refetchInterval: 15_000 },
  });

  const assets: (Asset & { balance: bigint })[] = useMemo(() => {
    const list: (Asset & { balance: bigint })[] = [{ key: "eth", symbol: chain.gasSymbol, decimals: 18, label: chain.gasSymbol, balance: eth?.value ?? 0n }];
    tokenAssets.forEach((t, i) => list.push({ ...t, balance: (tokenBalances?.[i]?.result as bigint | undefined) ?? 0n }));
    return list;
  }, [tokenAssets, tokenBalances, eth, chain.gasSymbol]);

  if (!ready) return <p className="text-center text-[14px] text-ink-soft">…</p>;
  if (!authenticated) {
    return (
      <Button size="lg" onClick={login}>
        Log in
      </Button>
    );
  }

  const handle = user?.twitter?.username ?? null;
  const avatar = user?.twitter?.profilePictureUrl?.replace("_normal", "") ?? null;
  const addr = address ?? wallet?.address ?? "";
  const isEmbedded = wallet?.walletClientType === "privy";

  return (
    <div className="flex flex-col gap-4">
      <Card pop={1}>
        <div className="flex items-center gap-3">
          <span className="clay-sm flex h-14 w-14 items-center justify-center overflow-hidden bg-sky-50" style={{ borderRadius: 999 }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-14 w-14 object-cover" />
            ) : (
              <span className="text-[26px]">🫥</span>
            )}
          </span>
          <div className="flex-1">
            <div className="heading text-[20px] text-ink">{handle ? `@${handle}` : short(addr)}</div>
            <div className="text-[12px] text-ink-soft">{isEmbedded ? "embedded wallet, made by your X login" : "external wallet"}</div>
          </div>
          {!handle && (
            <button onClick={linkTwitter} className="press clay-pill heading bg-sky-500 px-3 py-2 text-[13px] text-white">
              Link X
            </button>
          )}
        </div>
        <div className="mt-4">
          <Label>Wallet · {chain.name}</Label>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="mono break-all text-[13px] text-ink">{addr}</span>
            <CopyButton text={addr} />
          </div>
          <div className="num mt-2 text-[28px] leading-none text-ink">
            {eth ? Number(formatUnits(eth.value, 18)).toFixed(5) : "0.00000"} <span className="text-[14px] text-ink-soft">{chain.gasSymbol}</span>
          </div>
        </div>
        <div className="mt-4">
          <Label>Tokens · claimed fees land here</Label>
          {mojis === null && <p className="mt-1 text-[13px] text-ink-soft">loading…</p>}
          {mojis !== null && assets.length === 1 && <p className="mt-1 text-[13px] text-ink-soft">nothing yet. fees arrive as the stock token and the moji token.</p>}
          {assets.length > 1 && (
            <div className="mt-1 flex flex-col gap-1">
              {assets.slice(1).map((a) => (
                <div key={a.key} className="flex items-center justify-between text-[14px]">
                  <span className="heading text-ink">{a.label}</span>
                  <span className="num text-ink">{Number(formatUnits(a.balance, a.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <SendCard chainId={chainId} assets={assets} onSent={() => { void refetchEth(); void refetchTokens(); }} />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/me" className="press clay heading block bg-sky-50 px-4 py-3.5 text-center text-[15px] text-sky-600">
          your mojis + fees
        </Link>
        <button onClick={() => void logout()} className="press clay heading block bg-white px-4 py-3.5 text-center text-[15px] text-ink">
          Log out
        </button>
      </div>
    </div>
  );
}

function SendCard({ chainId, assets, onSent }: { chainId: number; assets: (Asset & { balance: bigint })[]; onSent: () => void }) {
  const [assetKey, setAssetKey] = useState("eth");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const asset = assets.find((a) => a.key === assetKey) ?? assets[0];
  const publicClient = usePublicClient({ chainId });
  const { sendTransactionAsync, isPending: sendingEth } = useSendTransaction();
  const { writeContractAsync, isPending: sendingToken } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId, query: { enabled: Boolean(hash) } });
  const busy = sendingEth || sendingToken || confirming;

  useEffect(() => {
    if (isSuccess) onSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  async function setMax() {
    if (!asset) return;
    if (asset.key === "eth") {
      const gasPrice = (await publicClient?.getGasPrice()) ?? 0n;
      const reserve = (21_000n * gasPrice * 15n) / 10n;
      const max = asset.balance > reserve ? asset.balance - reserve : 0n;
      setAmount(formatUnits(max, 18));
    } else {
      setAmount(formatUnits(asset.balance, asset.decimals));
    }
  }

  async function send() {
    setErr(null);
    setHash(undefined);
    if (!asset) return;
    if (!isAddress(to)) return setErr("That's not a valid address");
    let value: bigint;
    try {
      value = asset.key === "eth" ? parseEther(amount) : parseUnits(amount, asset.decimals);
    } catch {
      return setErr("Bad amount");
    }
    if (value <= 0n) return setErr("Amount must be more than 0");
    if (value > asset.balance) return setErr(`Not enough ${asset.symbol}`);
    try {
      const h =
        asset.key === "eth"
          ? await sendTransactionAsync({ to: to as Address, value, chainId })
          : await writeContractAsync({ address: asset.address!, abi: erc20Abi, functionName: "transfer", args: [to as Address, value], chainId });
      setHash(h);
    } catch (e) {
      const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
      setErr(msg.split("\n")[0].slice(0, 160));
    }
  }

  return (
    <Card tone="sky" pop={2}>
      <Label className="mb-3">Send</Label>
      <div className="scroll-x -mx-1 mb-3 flex gap-2 px-1">
        {assets.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => {
              setAssetKey(a.key);
              setAmount("");
            }}
            data-pressed={a.key === asset?.key ? "true" : undefined}
            className={`press clay-pill heading shrink-0 px-4 py-2 text-[14px] ${a.key === asset?.key ? "bg-sky-500 text-white" : "bg-white text-ink"}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <input className="clay-input mb-2" placeholder="Recipient 0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} autoComplete="off" spellCheck={false} />
      <div className="relative mb-3">
        <input className="clay-input num pr-20" placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        <button type="button" onClick={setMax} className="press clay-pill heading absolute right-2 top-1/2 -translate-y-1/2 bg-white px-3 py-1 text-[12px] text-sky-600">
          max
        </button>
      </div>
      <p className="mb-3 text-[12px] text-ink-soft">
        {asset ? `${Number(formatUnits(asset.balance, asset.decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 })} ${asset.symbol} available` : ""} · sends on {DEFAULT_CHAIN.name} only. Double check the address, this can&apos;t be undone.
      </p>
      <Button onClick={send} disabled={busy || !asset || !to || !amount}>
        {sendingEth || sendingToken ? "Confirm in wallet…" : confirming ? "Confirming…" : `Send ${asset?.symbol ?? ""}`}
      </Button>
      {hash && (
        <p className="mt-2 text-center text-[13px]">
          {isSuccess ? <span className="text-mint">sent</span> : <span className="text-ink-soft">pending</span>} ·{" "}
          <a href={explorerTx(chainId, hash)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
            view tx
          </a>
        </p>
      )}
      {err && (
        <p className="clay-sm mt-2 bg-white px-3 py-2 text-center text-[12px] text-coral" role="alert">
          {err}
        </p>
      )}
    </Card>
  );
}
