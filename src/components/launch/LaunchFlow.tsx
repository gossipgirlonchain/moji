"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Label } from "@/components/ui";
import { DEFAULT_CHAIN, type MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import { stockNumeraires, tokenNumeraires } from "@/lib/numeraire";
import { CURVE_DEFAULTS, type CurveDefaults } from "@/config/curve";
import { graphemes } from "@/lib/emoji";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { ChainPills } from "./ChainPills";
import { StockList } from "./StockList";
import { EmojiSlots } from "./EmojiSlots";
import { AvailabilityLine, useAvailability } from "./Availability";
import { Advanced } from "./Advanced";
import { LaunchAction, LaunchActionDisabled } from "./LaunchAction";
import { SolanaTease } from "./SolanaTease";
import { Button } from "@/components/ui";
import { MemeFields, memeReady, useMemeAvailability, type MemeDraft } from "./MemeFields";
import { memeDisplay } from "@/lib/memecoin";

export function LaunchFlow() {
  const [chain, setChain] = useState<MojiChain>(DEFAULT_CHAIN);
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [emoji, setEmoji] = useState<string[]>([]);
  const [curve, setCurve] = useState<CurveDefaults>(CURVE_DEFAULTS);
  const [kind, setKind] = useState<"moji" | "meme">("moji");
  const [meme, setMeme] = useState<MemeDraft>({ name: "", symbol: "", file: null });

  // Easter egg: BNB turns the page gold. The palette is CSS variables on <html>, so one attribute retints
  // everything; `theme-fade` eases the colors and a soft gold gradient behind the page fades in with them.
  const gold = chain.key === "bsc";
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    if (gold) root.dataset.theme = "gold";
    else delete root.dataset.theme;
    return () => {
      delete root.dataset.theme;
      root.classList.remove("theme-fade");
    };
  }, [gold]);

  const stocks = useMemo(() => stockNumeraires(chain), [chain]);
  const tokens = useMemo(() => tokenNumeraires(chain), [chain]);
  const [tab, setTab] = useState<"stock" | "token">(stocks.length ? "stock" : "token");
  const combo = emoji.join("");
  const { loading, result } = useAvailability(kind === "moji" ? combo : "", chain.chainId, stock?.address);
  const memeCheck = useMemeAvailability(kind === "meme" ? meme.symbol : "", chain.chainId, stock?.address);
  const available = kind === "meme" ? memeReady(meme, memeCheck.result, memeCheck.loading) : Boolean(combo && !loading && result?.valid && !result.claimed);

  return (
    <main className="flex flex-col gap-4">
      <div className="gold-sheen" aria-hidden />
      <h1 className="pop text-center text-[30px] text-sky-600">launch a {kind}</h1>

      {/* What you are launching: a moji (an emoji combo, claimed forever) or a meme (a regular memecoin: name, ticker, picture). */}
      <div className="pop grid grid-cols-2 gap-2">
        {(["moji", "meme"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            data-pressed={kind === k ? "true" : undefined}
            className={`press clay heading flex flex-col items-center gap-0.5 px-4 py-3 ${kind === k ? "bg-sky-500 text-white" : "bg-white text-ink"}`}
          >
            <span className="text-[22px] uppercase tracking-[0.08em]">{k === "moji" ? "moji 🍏" : "meme 🐸"}</span>
            <span className={`text-[12px] normal-case tracking-normal ${kind === k ? "text-white/85" : "text-ink-soft"}`}>{k === "moji" ? "1 to 3 emoji, claimed forever" : "name · ticker · picture"}</span>
          </button>
        ))}
      </div>

      <Card pop={1}>
        <Label className="mb-3">1 · Chain</Label>
        <ChainPills
          value={chain}
          onChange={(c) => {
            setChain(c);
            setStock(undefined);
            setTab(stockNumeraires(c).length ? "stock" : "token");
          }}
        />
      </Card>

      <Card pop={2}>
        {chain.key === "solana" ? (
          <SolanaTease />
        ) : (
        <>
        <div className="mb-3 flex items-center justify-between">
          <Label>2 · Pair {stock ? `· ${stock.ticker}` : ""}</Label>
          <div className="flex gap-1.5">
            {(["stock", "token"] as const).map((k) => {
              const n = k === "stock" ? stocks.length : tokens.length;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={n === 0}
                  onClick={() => {
                    setTab(k);
                    setStock(undefined);
                  }}
                  data-pressed={tab === k ? "true" : undefined}
                  className={`press clay-pill heading px-3.5 py-1.5 text-[12px] uppercase tracking-[0.1em] ${tab === k ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"} ${n === 0 ? "opacity-50" : ""}`}
                >
                  {k}
                  {n === 0 ? " · soon" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <StockList key={`${chain.key}-${tab}`} stocks={tab === "stock" ? stocks : tokens} value={stock} onChange={setStock} placeholder={tab === "stock" ? `Search ${stocks.length} stocks` : `Search ${tokens.length} tokens`} />
        </>
        )}
      </Card>

      <Card pop={3}>
        {kind === "moji" ? (
          <>
            <Label className="mb-3">3 · Your moji</Label>
            <EmojiSlots emoji={emoji} onChange={setEmoji} chainId={chain.chainId} pair={stock?.address} ticker={stock?.ticker} />
            <div className="mt-4">
              <AvailabilityLine combo={combo} loading={loading} result={result} onPick={(c) => setEmoji(graphemes(c))} />
            </div>
          </>
        ) : (
          <>
            <Label className="mb-3">3 · Your meme</Label>
            <MemeFields value={meme} onChange={setMeme} chainId={chain.chainId} pair={stock?.address} />
          </>
        )}
      </Card>

      {chain.key === "solana" ? (
        <Button size="lg" disabled className="pop pop-4">
          Solana soon
        </Button>
      ) : PRIVY_ENABLED ? (
        <LaunchAction chain={chain} stock={stock} combo={combo} available={available} curve={curve} kind={kind} meme={kind === "meme" ? meme : null} />
      ) : (
        <LaunchActionDisabled combo={kind === "meme" ? memeDisplay(meme.symbol) : combo} stock={stock} available={available} />
      )}

      <Advanced value={curve} onChange={setCurve} />

      <p className="text-center text-[12px] text-ink-soft">
        one wallet signature. you pay gas.
      </p>
    </main>
  );
}
