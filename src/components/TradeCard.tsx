"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, parseUnits, type Address, type Hex } from "viem";
import { chainById } from "@/config/chains";
import { transportFor } from "@/lib/rpc";
import { ensureChain, pickWallet } from "@/lib/wallet";
import { explorerTx } from "@/lib/links";
import { encodeSwap, ensureAllowances, fmtAmount, poolKeyFor, quoteExactIn, sendSwap, SLIPPAGE_BPS } from "@/lib/swap-client";
import { Label } from "./ui";
import { erc20Abi } from "viem";

type Props = { combo: string; ticker: string; chainId: number; tokenAddress: string; stockAddress: string; stockDecimals: number; poolId: string };

/** Buy or sell a moji with its paired stock, straight through the Doppler pool. */
export function TradeCard(p: Props) {
  const chain = chainById(p.chainId);
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const wallet = useMemo(() => pickWallet(wallets), [wallets]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [bal, setBal] = useState<{ stock: bigint; moji: bigint } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Hex | null>(null);

  const pc = useMemo(() => (chain?.viem ? createPublicClient({ chain: chain.viem, transport: transportFor(chain.viem) }) : null), [chain]);
  const key = useMemo(() => poolKeyFor(p.chainId, p.tokenAddress as Address, p.stockAddress as Address, p.poolId as Hex), [p.chainId, p.tokenAddress, p.stockAddress, p.poolId]);
  const tokenIn = (side === "buy" ? p.stockAddress : p.tokenAddress) as Address;
  const tokenOut = (side === "buy" ? p.tokenAddress : p.stockAddress) as Address;
  const decIn = side === "buy" ? p.stockDecimals : 18;
  const decOut = side === "buy" ? 18 : p.stockDecimals;
  const labelIn = side === "buy" ? p.ticker : p.combo;
  const labelOut = side === "buy" ? p.combo : p.ticker;

  useEffect(() => {
    if (!pc || !address) return;
    let alive = true;
    const load = async () => {
      const [stock, moji] = await Promise.all([
        pc.readContract({ address: p.stockAddress as Address, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        pc.readContract({ address: p.tokenAddress as Address, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      ]);
      if (alive) setBal({ stock, moji });
    };
    void load();
    return () => {
      alive = false;
    };
  }, [pc, address, p.stockAddress, p.tokenAddress, done]);

  const amountIn = useMemo(() => {
    try {
      return amount ? parseUnits(amount, decIn) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, decIn]);

  useEffect(() => {
    setQuote(null);
    if (!pc || !key || amountIn <= 0n) return;
    let alive = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await quoteExactIn(pc, p.chainId, key, tokenIn, amountIn);
        if (alive) setQuote(q);
      } catch {
        if (alive) setQuote(null);
      } finally {
        if (alive) setQuoting(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pc, key, amountIn, tokenIn, p.chainId]);

  const balIn = bal ? (side === "buy" ? bal.stock : bal.moji) : null;
  const insufficient = balIn != null && amountIn > balIn;

  async function swap() {
    if (!pc || !key || !wallet || !address || !chain?.viem || quote == null) return;
    setError(null);
    setDone(null);
    try {
      setBusy("switching chain");
      const provider = await ensureChain(wallet, chain.viem);
      const wc = createWalletClient({ chain: chain.viem, account: address, transport: custom(provider) });
      await ensureAllowances(pc, wc, p.chainId, address, tokenIn, amountIn, setBusy);
      setBusy("confirm swap");
      const minOut = (quote * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
      const hash = await sendSwap(pc, wc, p.chainId, address, encodeSwap(p.chainId, key, tokenIn, tokenOut, amountIn, minOut));
      setDone(hash);
      setAmount("");
    } catch (e) {
      const msg = String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e);
      setError(/rejected|denied/i.test(msg) ? "cancelled" : msg.slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  if (!key) return null;
  return (
    <section className="clay pop pop-3 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <Label>Trade</Label>
        <div className="flex gap-2">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" onClick={() => { setSide(s); setAmount(""); setDone(null); setError(null); }} data-pressed={side === s ? "true" : undefined} className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${side === s ? (s === "buy" ? "bg-mint text-white" : "bg-coral text-white") : "bg-sky-50 text-ink"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
        <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="num w-full bg-transparent text-[28px] leading-none text-ink outline-none" />
        <span className="heading shrink-0 text-[15px] text-ink">{labelIn}</span>
      </div>
      <div className="mt-1 flex justify-between px-1 text-[12px] text-ink-soft">
        <span>{balIn != null ? `balance ${fmtAmount(balIn, decIn)} ${labelIn}` : ""}</span>
        {balIn != null && balIn > 0n && (
          <button type="button" className="text-sky-600" onClick={() => setAmount(fmtAmount(balIn, decIn, 18).replace(/,/g, ""))}>
            max
          </button>
        )}
      </div>

      <div className="clay-sm mt-3 flex items-center justify-between bg-white px-4 py-3">
        <span className="num text-[24px] leading-none text-ink">{quoting ? "…" : quote != null ? fmtAmount(quote, decOut) : "0"}</span>
        <span className="heading text-[15px] text-ink">{labelOut}</span>
      </div>

      <div className="mt-4">
        {!authenticated ? (
          <button type="button" onClick={login} className="press clay heading block w-full bg-sky-500 px-5 py-3 text-[16px] text-white">
            Log in to trade
          </button>
        ) : (
          <button type="button" disabled={!!busy || quote == null || amountIn <= 0n || insufficient} onClick={swap} className={`press clay heading block w-full px-5 py-3 text-[16px] text-white disabled:opacity-50 ${side === "buy" ? "bg-mint" : "bg-coral"}`}>
            {busy ?? (insufficient ? `not enough ${labelIn}` : side === "buy" ? `BUY ${p.combo}` : `SELL ${p.combo}`)}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-center text-[12px] text-coral">{error}</p>}
      {done && (
        <p className="mt-2 text-center text-[12px] text-ink-soft">
          done ·{" "}
          <a href={explorerTx(p.chainId, done)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
            tx
          </a>
        </p>
      )}
    </section>
  );
}
