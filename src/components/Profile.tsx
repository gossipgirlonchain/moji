"use client";

import { pickWallet } from "@/lib/wallet";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount, useBalance, usePublicClient, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, formatUnits, isAddress, parseEther, parseUnits, type Address } from "viem";
import { CHAINS, DEFAULT_CHAIN, type MojiChain } from "@/config/chains";
import { chainLaunchable } from "@/lib/numeraire";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { explorerTx } from "@/lib/links";
import { short } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { DelegateCard } from "./DelegateCard";
import { Button, Card, Label } from "./ui";

export function Profile() {
  if (!PRIVY_ENABLED) return <p className="text-center text-[14px] text-ink-soft">login is off until NEXT_PUBLIC_PRIVY_APP_ID is set.</p>;
  return <ProfileInner />;
}

type Asset = { key: string; symbol: string; address?: Address; decimals: number; label: string; weth?: boolean };

function ProfileInner() {
  const [chain, setChain] = useState<MojiChain>(DEFAULT_CHAIN);
  const chainId = chain.viem!.id;
  const liveChains = CHAINS.filter((c) => chainLaunchable(c));
  const { ready, authenticated, user, login, logout, linkTwitter, linkEmail, unlinkTwitter, unlinkEmail } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const wallet = useMemo(() => pickWallet(wallets), [wallets]);
  // The account's wallet is always the active one here: a browser wallet (Phantom, MetaMask) left active
  // from another page must not be shown or used as this login's wallet.
  useEffect(() => {
    if (wallet && authenticated && address?.toLowerCase() !== wallet.address.toLowerCase()) void setActiveWallet(wallet);
  }, [wallet, authenticated, address, setActiveWallet]);

  const { data: eth, refetch: refetchEth } = useBalance({ address, chainId, query: { enabled: Boolean(address), refetchInterval: 12_000 } });

  // Everything this wallet actually holds on the selected chain: moji tokens, stock tokens, WETH.
  // Read from chain via one multicall over every known token, so tokens sent to the user show up too.
  type Holding = { address: Address; symbol: string; label: string; decimals: number; balance: string; kind: "moji" | "stock" | "weth" };
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!address) return;
    let alive = true;
    setHoldings(null);
    fetch(`/api/me/holdings?address=${address}&chainId=${chainId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { holdings?: Holding[] }) => alive && setHoldings(j.holdings ?? []))
      .catch(() => alive && setHoldings([]));
    return () => {
      alive = false;
    };
  }, [address, chainId, tick]);
  const refetchTokens = () => setTick((t) => t + 1);
  const mojis: unknown[] | null = holdings;

  const assets: (Asset & { balance: bigint })[] = useMemo(() => {
    const list: (Asset & { balance: bigint })[] = [{ key: "eth", symbol: chain.gasSymbol, decimals: 18, label: chain.gasSymbol, balance: eth?.value ?? 0n }];
    for (const h of holdings ?? []) list.push({ key: h.address.toLowerCase(), symbol: h.symbol, address: h.address, decimals: h.decimals, label: h.label, weth: h.kind === "weth", balance: BigInt(h.balance) });
    return list;
  }, [holdings, eth, chain.gasSymbol]);

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
  // The profile is the account's own wallet (the embedded one when it exists). A browser wallet that happens
  // to be active in wagmi (Phantom, MetaMask) is not this login's wallet and must not be shown as if it were.
  const addr = wallet?.address ?? address ?? "";
  const isEmbedded = wallet?.walletClientType === "privy";
  const otherConnected = address && wallet && address.toLowerCase() !== wallet.address.toLowerCase() ? address : null;

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
            <div className="text-[12px] text-ink-soft">{isEmbedded ? "embedded wallet, made by your X login" : `external wallet · ${wallet?.walletClientType ?? "connected"}`}</div>
            {otherConnected && <div className="text-[11px] text-ink-soft">browser wallet {short(otherConnected)} is connected but is not this account</div>}
          </div>
          {!handle && (
            <button onClick={linkTwitter} className="press clay-pill heading bg-sky-500 px-3 py-2 text-[13px] text-white">
              Link X
            </button>
          )}
        </div>
        {/* Logins attached to this wallet. An email login lets the X account be unlinked without losing the wallet. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
          <span className="heading uppercase tracking-[0.1em]">logins</span>
          {handle && <span className="clay-pill bg-sky-50 px-2.5 py-1 text-ink">X @{handle}</span>}
          {user?.email?.address && <span className="clay-pill bg-sky-50 px-2.5 py-1 text-ink">{user.email.address}</span>}
          {!user?.email?.address ? (
            <button type="button" onClick={linkEmail} className="press clay-pill heading bg-white px-2.5 py-1 text-[12px] text-sky-600">
              + link email
            </button>
          ) : (
            handle && (
              <button type="button" onClick={() => user?.twitter?.subject && unlinkTwitter(user.twitter.subject)} className="press clay-pill heading bg-white px-2.5 py-1 text-[12px] text-coral">
                unlink X
              </button>
            )
          )}
          {user?.email?.address && !handle && (
            <button type="button" onClick={() => user?.email?.address && unlinkEmail(user.email.address)} className="press clay-pill heading bg-white px-2.5 py-1 text-[12px] text-coral">
              unlink email
            </button>
          )}
        </div>
        <div className="mt-4">
          <div className="scroll-x -mx-1 mb-2 flex gap-2 px-1">
            {liveChains.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setChain(c)}
                data-pressed={c.key === chain.key ? "true" : undefined}
                className={`press clay-pill heading shrink-0 px-3 py-1.5 text-[13px] ${c.key === chain.key ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}
              >
                {c.emoji} {c.short}
              </button>
            ))}
          </div>
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
          <Label>Tokens</Label>
          {mojis === null && <p className="mt-1 text-[13px] text-ink-soft">loading…</p>}
          {mojis !== null && assets.length === 1 && <p className="mt-1 text-[13px] text-ink-soft">none on {chain.short} yet.</p>}
          {assets.length > 1 && (
            <div className="mt-1 flex flex-col gap-1">
              {assets.slice(1).map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-2 text-[14px]">
                  <span className="heading text-ink">{a.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="num text-ink">{Number(formatUnits(a.balance, a.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    {a.weth && a.balance > 0n && <UnwrapButton asset={a} chainId={chainId} onDone={() => { void refetchEth(); void refetchTokens(); }} />}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <DelegateCard />

      <SendCard chain={chain} chainId={chainId} assets={assets} onSent={() => { void refetchEth(); void refetchTokens(); }} />

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

type Resolved = { handle: string; address: string; mojis: string[] };

const wethAbi = [{ type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] }] as const;

/** WETH.withdraw(balance): turns claimed WETH fees into plain ETH in the same wallet. */
function UnwrapButton({ asset, chainId, onDone }: { asset: Asset & { balance: bigint }; chainId: number; onDone: () => void }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { chainId: walletChainId } = useAccount();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash, chainId, query: { enabled: Boolean(hash) } });
  useEffect(() => {
    if (isSuccess) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={isPending || isLoading}
        onClick={async () => {
          setErr(null);
          try {
            if (walletChainId !== chainId) await switchChainAsync({ chainId });
            setHash(await writeContractAsync({ address: asset.address!, abi: wethAbi, functionName: "withdraw", args: [asset.balance], chainId }));
          } catch (e) {
            const m = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e);
            setErr(/rejected|denied/i.test(m) ? "cancelled" : m.split("\n")[0].slice(0, 60));
          }
        }}
        className="press clay-pill heading bg-sky-500 px-2.5 py-1 text-[11px] text-white disabled:opacity-60"
      >
        {isPending ? "confirm…" : isLoading ? "unwrapping…" : "unwrap to ETH"}
      </button>
      {err && <span className="text-[11px] text-coral">{err}</span>}
    </span>
  );
}

function SendCard({ chain, chainId, assets, onSent }: { chain: MojiChain; chainId: number; assets: (Asset & { balance: bigint })[]; onSent: () => void }) {
  const [assetKey, setAssetKey] = useState("eth");
  const [to, setTo] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const isHandle = to.startsWith("@");
  const target = isHandle ? resolved?.address ?? "" : to;

  // @handle → launcher wallet, debounced
  useEffect(() => {
    setResolved(null);
    setResolveErr(null);
    if (!isHandle || to.length < 2) return;
    let alive = true;
    setResolving(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/resolve?handle=${encodeURIComponent(to.slice(1))}`, { cache: "no-store" });
        const j = (await r.json()) as Resolved & { error?: string };
        if (!alive) return;
        if (!r.ok) setResolveErr(j.error ?? "not found");
        else setResolved(j);
      } catch {
        if (alive) setResolveErr("couldn't look that up");
      } finally {
        if (alive) setResolving(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [to, isHandle]);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const asset = assets.find((a) => a.key === assetKey) ?? assets[0];
  const publicClient = usePublicClient({ chainId });
  const { sendTransactionAsync, isPending: sendingEth } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const { chainId: walletChainId } = useAccount();
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
    if (!isAddress(target)) return setErr(isHandle ? "Pick a launcher's @handle or paste a 0x address" : "That's not a valid address");
    let value: bigint;
    try {
      value = asset.key === "eth" ? parseEther(amount) : parseUnits(amount, asset.decimals);
    } catch {
      return setErr("Bad amount");
    }
    if (value <= 0n) return setErr("Amount must be more than 0");
    if (value > asset.balance) return setErr(`Not enough ${asset.symbol}`);
    try {
      if (walletChainId !== chainId) await switchChainAsync({ chainId });
      const h =
        asset.key === "eth"
          ? await sendTransactionAsync({ to: target as Address, value, chainId })
          : await writeContractAsync({ address: asset.address!, abi: erc20Abi, functionName: "transfer", args: [target as Address, value], chainId });
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
      <input className="clay-input mb-1" placeholder="Recipient 0x… or @handle of a launcher" value={to} onChange={(e) => setTo(e.target.value.trim())} autoComplete="off" spellCheck={false} />
      <div className="mb-2 min-h-[18px] px-1 text-[12px]">
        {isHandle && resolving && <span className="text-ink-soft">looking up {to}…</span>}
        {isHandle && resolveErr && <span className="text-coral">{resolveErr}</span>}
        {isHandle && resolved && (
          <span className="text-ink">
            <span className="heading text-mint">@{resolved.handle}</span> → <span className="mono">{resolved.address.slice(0, 6)}…{resolved.address.slice(-4)}</span> · launched {resolved.mojis.slice(0, 4).join(" ")}
            {resolved.mojis.length > 4 ? ` +${resolved.mojis.length - 4}` : ""}
          </span>
        )}
      </div>
      <div className="relative mb-3">
        <input className="clay-input num pr-20" placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        <button type="button" onClick={setMax} className="press clay-pill heading absolute right-2 top-1/2 -translate-y-1/2 bg-white px-3 py-1 text-[12px] text-sky-600">
          max
        </button>
      </div>
      <p className="mb-3 text-[12px] text-ink-soft">
        {asset ? `${Number(formatUnits(asset.balance, asset.decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 })} ${asset.symbol} available` : ""} · sends on {chain.name}. @handles resolve to the wallet that launched under them. This can&apos;t be undone.
      </p>
      <Button onClick={send} disabled={busy || !asset || !target || !amount}>
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
