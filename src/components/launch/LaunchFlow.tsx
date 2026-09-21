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
import { MemePicker } from "@/components/MemePicker";
import { MemeDetailsFields } from "@/components/MemeDetailsFields";
import { EMPTY_DETAILS, type MemeDetails } from "@/lib/meme-details";

export function LaunchFlow() {
  const [chain, setChain] = useState<MojiChain>(DEFAULT_CHAIN);
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [emoji, setEmoji] = useState<string[]>([]);
  const [curve, setCurve] = useState<CurveDefaults>(CURVE_DEFAULTS);
  const [meme, setMeme] = useState<File | null>(null);
  const [details, setDetails] = useState<MemeDetails>(EMPTY_DETAILS);

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
  const { loading, result } = useAvailability(combo, chain.chainId, stock?.address);
  const available = Boolean(combo && !loading && result?.valid && !result.claimed);

  return (
    <main className="flex flex-col gap-4">
      <div className="gold-sheen" aria-hidden />
      <h1 className="pop text-center text-[30px] text-sky-600">launch a moji</h1>

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
        <Label className="mb-3">3 · Your moji</Label>
        <EmojiSlots emoji={emoji} onChange={setEmoji} chainId={chain.chainId} pair={stock?.address} ticker={stock?.ticker} />
        <div className="mt-4">
          <AvailabilityLine combo={combo} loading={loading} result={result} onPick={(c) => setEmoji(graphemes(c))} />
        </div>
      </Card>

      <Card pop={4}>
        <Label className="mb-1">4 · Meme <span className="normal-case tracking-normal text-ink-soft">· optional</span></Label>
        <p className="mb-3 text-[13px] text-ink-soft">a picture for your moji. it becomes the token image, the share card and the tile everywhere. a line about it and your links show on the moji page. you can add or change all of it later.</p>
        <MemePicker value={meme} onChange={setMeme} />
        <MemeDetailsFields value={details} onChange={setDetails} className="mt-3" />
      </Card>

      {chain.key === "solana" ? (
        <Button size="lg" disabled className="pop pop-4">
          Solana soon
        </Button>
      ) : PRIVY_ENABLED ? (
        <LaunchAction chain={chain} stock={stock} combo={combo} available={available} curve={curve} meme={meme} details={details} />
      ) : (
        <LaunchActionDisabled combo={combo} stock={stock} available={available} />
      )}

      <Advanced value={curve} onChange={setCurve} />

      <p className="text-center text-[12px] text-ink-soft">
        one wallet signature. you pay gas.
      </p>
    </main>
  );
}
