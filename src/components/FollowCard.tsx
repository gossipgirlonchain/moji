"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address } from "viem";
import { pickWallet } from "@/lib/wallet";
import { Label } from "./ui";

type Rules = { copy: boolean; maxPerTradeUsd: number; maxPerDayUsd: number; pairs: string[] | null; minHolders: number };
type Mine = { id: string; copy: boolean; max_per_trade_usd: number; max_per_day_usd: number; pairs: string[] | null; min_holders: number } | null;

const sorted = (o: unknown): unknown => (Array.isArray(o) ? o : o && typeof o === "object" ? Object.fromEntries(Object.keys(o as object).sort().map((k) => [k, sorted((o as Record<string, unknown>)[k])])) : o);
/** Same bytes as src/lib/follows.ts canonicalFollowMessage. */
const message = (action: "follow" | "unfollow", follower: string, followee: string, rules: Rules, ts: number) =>
  `moji follow v1\n${JSON.stringify(sorted({ action, followee: followee.toLowerCase(), follower: follower.toLowerCase(), rules, ts }))}`;

/**
 * Follow the wallet that launched this moji, and optionally copy its trades within limits you set.
 * Storing the rules is all this does today; the copy engine that acts on them is not built yet.
 */
export function FollowCard({ followee, display, ticker }: { followee: string; display: string; ticker: string }) {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const [count, setCount] = useState<number | null>(null);
  const [mine, setMine] = useState<Mine>(null);
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<Rules>({ copy: false, maxPerTradeUsd: 20, maxPerDayUsd: 100, pairs: null, minHolders: 0 });
  const [pairsText, setPairsText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const self = Boolean(address && address.toLowerCase() === followee.toLowerCase());

  const load = useCallback(async () => {
    const r = await fetch(`/api/follows?followee=${followee}${address ? `&follower=${address}` : ""}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { count: number; mine: Mine };
    setCount(j.count);
    setMine(j.mine);
    if (j.mine) {
      setRules({ copy: j.mine.copy, maxPerTradeUsd: Number(j.mine.max_per_trade_usd), maxPerDayUsd: Number(j.mine.max_per_day_usd), pairs: j.mine.pairs, minHolders: j.mine.min_holders });
      setPairsText((j.mine.pairs ?? []).join(", "));
    }
  }, [followee, address]);
  useEffect(() => {
    void load();
  }, [load]);

  async function sign(action: "follow" | "unfollow", r: Rules) {
    const wallet = wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase()) ?? pickWallet(wallets);
    if (!wallet || !address) return;
    setError(null);
    try {
      setBusy("sign");
      const provider = await wallet.getEthereumProvider();
      const wc = createWalletClient({ account: address as Address, transport: custom(provider) });
      const ts = Date.now();
      const signature = await wc.signMessage({ message: message(action, address, followee, r, ts) });
      setBusy("saving");
      const res = await fetch("/api/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, follower: address, followee, rules: r, ts, signature }) });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "could not save");
      await load();
      setOpen(false);
    } catch (e) {
      const msg = String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e);
      setError(/rejected|denied/i.test(msg) ? "cancelled" : msg.slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  const following = Boolean(mine);
  const save = () => {
    const pairs = pairsText.split(/[\s,]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
    return sign("follow", { ...rules, pairs: pairs.length ? pairs : null });
  };

  return (
    <section className="clay pop pop-3 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>Follow</Label>
          <p className="heading mt-1 text-[15px] text-ink">
            {display} <span className="text-ink-soft">/ {ticker}</span>
            {count != null && <span className="text-ink-soft"> · {count.toLocaleString()} {count === 1 ? "follower" : "followers"}</span>}
          </p>
        </div>
        {!authenticated ? (
          <button type="button" onClick={login} className="press clay-pill heading bg-sky-500 px-4 py-2 text-[14px] text-white">
            Log in
          </button>
        ) : self ? (
          <span className="text-[12px] text-ink-soft">this is you</span>
        ) : following ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)} className="press clay-pill heading bg-sky-50 px-3.5 py-2 text-[13px] text-ink">
              {mine?.copy ? "copying" : "rules"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => sign("unfollow", rules)} className="press clay-pill heading bg-sky-50 px-3.5 py-2 text-[13px] text-ink disabled:opacity-50">
              {busy ?? "following ✓"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)} className="press clay-pill heading bg-sky-50 px-3.5 py-2 text-[13px] text-ink">
              rules
            </button>
            <button type="button" disabled={!!busy} onClick={() => sign("follow", { ...rules, copy: false })} className="press clay-pill heading bg-sky-500 px-4 py-2 text-[14px] text-white disabled:opacity-50">
              {busy ?? "Follow"}
            </button>
          </div>
        )}
      </div>

      {open && authenticated && !self && (
        <div className="mt-4 flex flex-col gap-3 text-[13px]">
          <label className="flex items-center justify-between gap-3">
            <span className="text-ink">Copy this agent&apos;s trades</span>
            <input type="checkbox" checked={rules.copy} onChange={(e) => setRules({ ...rules, copy: e.target.checked })} className="h-5 w-5" />
          </label>
          <label className="flex items-center justify-between gap-3 text-ink-soft">
            <span>Max per trade ($)</span>
            <input type="number" min={0} step={5} value={rules.maxPerTradeUsd} onChange={(e) => setRules({ ...rules, maxPerTradeUsd: Number(e.target.value) })} className="num clay-sm w-28 bg-sky-50 px-3 py-1.5 text-right text-ink outline-none" />
          </label>
          <label className="flex items-center justify-between gap-3 text-ink-soft">
            <span>Max per day ($)</span>
            <input type="number" min={0} step={10} value={rules.maxPerDayUsd} onChange={(e) => setRules({ ...rules, maxPerDayUsd: Number(e.target.value) })} className="num clay-sm w-28 bg-sky-50 px-3 py-1.5 text-right text-ink outline-none" />
          </label>
          <label className="flex items-center justify-between gap-3 text-ink-soft">
            <span>Only pairs (tickers, blank = any)</span>
            <input value={pairsText} onChange={(e) => setPairsText(e.target.value)} placeholder="AAPL, TSLA" className="clay-sm w-40 bg-sky-50 px-3 py-1.5 text-ink outline-none" />
          </label>
          <label className="flex items-center justify-between gap-3 text-ink-soft">
            <span>Only mojis with at least N holders</span>
            <input type="number" min={0} step={10} value={rules.minHolders} onChange={(e) => setRules({ ...rules, minHolders: Number(e.target.value) })} className="num clay-sm w-28 bg-sky-50 px-3 py-1.5 text-right text-ink outline-none" />
          </label>
          <p className="text-[12px] text-ink-soft">You sign these rules with your wallet. Copying is not live yet; the rules are saved for when it is.</p>
          <button type="button" disabled={!!busy} onClick={save} className="press clay heading bg-sky-500 px-5 py-3 text-[15px] text-white disabled:opacity-50">
            {busy ?? (following ? "Save rules" : "Follow with these rules")}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-center text-[12px] text-coral">{error}</p>}
    </section>
  );
}
