"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, formatUnits, isAddress, parseUnits, type Address } from "viem";
import { Card, Label } from "@/components/ui";
import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import { stockPriceUsd } from "@/lib/price";
import { short, usd } from "@/lib/format";

type Earner = "me" | "x" | "wallet";

/**
 * Creator fees: who earns the creator's 70% share. Me (default), an X user who has launched on moji (their wallet,
 * via /api/resolve), or any wallet address. Set on-chain in the pool's beneficiaries at launch; cannot change later.
 */
export function CreatorFeesCard({ value, onChange }: { value: Address | null; onChange: (a: Address | null) => void }) {
  const [earner, setEarner] = useState<Earner>("me");
  const [handle, setHandle] = useState("");
  const [wallet, setWallet] = useState("");
  const [state, setState] = useState<{ status: "idle" | "checking" | "ok" | "bad"; note?: string }>({ status: "idle" });

  useEffect(() => {
    if (earner === "me") {
      onChange(null);
      setState({ status: "idle" });
      return;
    }
    if (earner === "wallet") {
      const a = wallet.trim();
      if (!a) {
        onChange(null);
        setState({ status: "idle" });
        return;
      }
      if (isAddress(a)) {
        onChange(a as Address);
        setState({ status: "ok", note: `fees go to ${short(a)}` });
      } else {
        onChange(null);
        setState({ status: "bad", note: "that is not a wallet address" });
      }
      return;
    }
    const h = handle.trim().replace(/^@/, "");
    if (!h) {
      onChange(null);
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    setState({ status: "checking" });
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/resolve?handle=${encodeURIComponent(h)}`, { cache: "no-store" });
        const j = (await r.json()) as { address?: string; handle?: string; error?: string };
        if (!alive) return;
        if (r.ok && j.address && isAddress(j.address)) {
          onChange(j.address as Address);
          setState({ status: "ok", note: `fees go to @${j.handle} · ${short(j.address)}` });
        } else {
          onChange(null);
          setState({ status: "bad", note: j.error ?? `@${h} hasn't launched on moji yet. paste their wallet instead.` });
        }
      } catch {
        if (alive) setState({ status: "bad", note: "could not look that up" });
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earner, handle, wallet]);

  const pill = (k: Earner, label: string) => (
    <button key={k} type="button" onClick={() => setEarner(k)} data-pressed={earner === k ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${earner === k ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}>
      {label}
    </button>
  );
  return (
    <Card pop={4}>
      <Label className="mb-1">
        Creator fees <span className="normal-case tracking-normal text-ink-soft">· who earns them</span>
      </Label>
      <p className="mb-3 text-[13px] text-ink-soft">70% of every swap fee is the creator&apos;s. It goes to you unless you point it at someone else (an X user who has launched on moji, or any wallet). Set at launch, on-chain, for good.</p>
      <div className="flex flex-wrap gap-2">
        {pill("me", "🙋 me")}
        {pill("x", "𝕏 an X user")}
        {pill("wallet", "👛 a wallet")}
      </div>
      {earner === "x" && <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" autoComplete="off" className="clay-input mt-3 !py-2.5 text-[14px]" />}
      {earner === "wallet" && <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} className="clay-input mono mt-3 !py-2.5 text-[13px]" />}
      {state.note && <p className={`mt-2 text-[12px] ${state.status === "bad" ? "text-coral" : "text-mint"}`}>{state.note}</p>}
      {state.status === "checking" && <p className="mt-2 text-[12px] text-ink-soft">checking…</p>}
      {value && <p className="mt-2 text-[12px] text-ink-soft">fees are paid in {"the paired stock or token"} and your token, straight to that wallet.</p>}
    </Card>
  );
}

const PRESETS_USD = [200, 500, 1000];

/**
 * Developer buy: buy some of your own token in the launch transaction (Doppler's Bundler creates the market and
 * swaps in one go). Amounts are in the paired stock or token, shown in USD; "max" is the wallet's whole balance.
 */
export function DevBuyCard({ chain, stock, value, onChange }: { chain: MojiChain; stock?: Stock; value: bigint | null; onChange: (wei: bigint | null) => void }) {
  const { address } = useAccount();
  const chainId = chain.viem?.id ?? chain.chainId;
  const { data: bal } = useReadContract({ abi: erc20Abi, address: stock?.address as Address | undefined, functionName: "balanceOf", args: address ? [address] : undefined, chainId, query: { enabled: Boolean(address && stock), refetchInterval: 15_000 } });
  const [price, setPrice] = useState<number>(0);
  const [picked, setPicked] = useState<number | "max" | null>(null);

  useEffect(() => {
    setPrice(0);
    setPicked(null);
    onChange(null);
    if (!stock) return;
    let alive = true;
    stockPriceUsd(stock)
      .then((p) => alive && setPrice(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock?.address, chainId]);

  const balance = bal ?? 0n;
  const decimals = stock?.decimals ?? 18;
  const balanceUsd = price > 0 ? Number(formatUnits(balance, decimals)) * price : 0;
  const weiFor = (usdAmount: number) => (price > 0 ? parseUnits((usdAmount / price).toFixed(Math.min(decimals, 8)), decimals) : 0n);

  function pick(p: number | "max") {
    if (picked === p) {
      setPicked(null);
      onChange(null);
      return;
    }
    setPicked(p);
    onChange(p === "max" ? balance : weiFor(p));
  }

  const chosenUsd = value && value > 0n && price > 0 ? Number(formatUnits(value, decimals)) * price : 0;
  const over = Boolean(value && value > balance);
  return (
    <Card pop={5}>
      <Label className="mb-1">
        Developer buy <span className="normal-case tracking-normal text-ink-soft">· optional</span>
      </Label>
      <p className="mb-3 text-[13px] text-ink-soft">buy some of your token in the same transaction as the launch, before anyone else can. paid in {stock ? stock.ticker : "the pair"}; you can also launch without one and buy on the market.</p>
      {!stock ? (
        <p className="text-[13px] text-ink-soft">pick a pair first.</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-[13px]">
            <span className="text-ink-soft">
              balance <span className="num text-ink">{Number(formatUnits(balance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> {stock.ticker}
              {balanceUsd > 0 ? <span className="text-ink-soft"> · {usd(balanceUsd)}</span> : null}
            </span>
            {price > 0 && <span className="num text-ink-soft">{usd(price, { compact: false })} / {stock.ticker}</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS_USD.map((p) => (
              <button key={p} type="button" onClick={() => pick(p)} disabled={price <= 0} data-pressed={picked === p ? "true" : undefined} className={`press clay-pill heading py-2 text-[14px] ${picked === p ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"} disabled:opacity-50`}>
                ${p >= 1000 ? `${p / 1000}K` : p}
              </button>
            ))}
            <button type="button" onClick={() => pick("max")} disabled={balance === 0n} data-pressed={picked === "max" ? "true" : undefined} className={`press clay-pill heading py-2 text-[14px] ${picked === "max" ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"} disabled:opacity-50`}>
              max
            </button>
          </div>
          {value && value > 0n ? (
            <p className={`mt-2 text-[12px] ${over ? "text-coral" : "text-ink-soft"}`}>
              {over ? `that is more ${stock.ticker} than this wallet holds.` : `buys ${Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${stock.ticker} worth of your token${chosenUsd > 0 ? ` (${usd(chosenUsd)})` : ""}. one extra approval signature the first time.`}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-ink-soft">{price <= 0 ? `no ${stock.ticker} price right now, try again in a moment.` : "nothing picked, no developer buy."}</p>
          )}
        </>
      )}
    </Card>
  );
}
