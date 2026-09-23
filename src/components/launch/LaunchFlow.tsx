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
import { validateMeme, type LaunchKind } from "@/lib/meme-coin";
import { MemeSlots } from "./MemeSlots";
import { CreatorFeesCard, DevBuyCard } from "./LaunchExtras";
import type { Address } from "viem";

/**
 * Two things launch here: a moji (1 to 3 emoji paired to a stock or token) or a meme, a traditional memecoin
 * with a title, a ticker and a picture. Same chain, same pairs, same curve; step 3 and the picture rules differ.
 */
export function LaunchFlow() {
  const [kind, setKind] = useState<LaunchKind>("moji");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [chain, setChain] = useState<MojiChain>(DEFAULT_CHAIN);
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [emoji, setEmoji] = useState<string[]>([]);
  const [curve, setCurve] = useState<CurveDefaults>(CURVE_DEFAULTS);
  const [meme, setMeme] = useState<File | null>(null);
  const [details, setDetails] = useState<MemeDetails>(EMPTY_DETAILS);
  const [feeRecipient, setFeeRecipient] = useState<Address | null>(null);
  const [devBuyIn, setDevBuyIn] = useState<bigint | null>(null);

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
  // The claim: the emoji combo, or the meme's ticker as `$PEPE`.
  const memeCheck = kind === "meme" ? validateMeme({ name: name || "meme", symbol }) : null;
  const combo = kind === "meme" ? (memeCheck?.ok ? memeCheck.display : "") : emoji.join("");
  const { loading, result } = useAvailability(combo, chain.chainId, stock?.address);
  const memeReady = kind === "meme" ? validateMeme({ name, symbol }).ok && Boolean(meme) : true;
  const available = Boolean(combo && !loading && result?.valid && !result.claimed && memeReady);
  const memeHint = kind === "meme" ? (!symbol ? "pick a ticker" : memeCheck && !memeCheck.ok ? memeCheck.reason : !name.trim() ? "give it a title" : !meme ? "add a picture" : null) : null;

  return (
    <main className="flex flex-col gap-4">
      <div className="gold-sheen" aria-hidden />
      <h1 className="pop text-center text-[30px] text-sky-600">launch {kind === "meme" ? "a meme" : "a moji"}</h1>
      <div className="pop flex justify-center gap-2">
        {(["moji", "meme"] as LaunchKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} data-pressed={kind === k ? "true" : undefined} className={`press clay-pill heading px-5 py-2 text-[15px] ${kind === k ? "bg-sky-500 text-white" : "bg-white text-ink"}`}>
            {k === "moji" ? "🍏 moji" : "🐸 meme"}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-center text-[13px] text-ink-soft">{kind === "moji" ? "1 to 3 emoji, paired to a stock or token." : "a regular memecoin: title, ticker, picture. paired to a stock or token."}</p>

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

      {kind === "moji" ? (
        <>
          <Card pop={3}>
            <Label className="mb-3">3 · Your moji</Label>
            <EmojiSlots emoji={emoji} onChange={setEmoji} chainId={chain.chainId} pair={stock?.address} ticker={stock?.ticker} />
            <div className="mt-4">
              <AvailabilityLine combo={combo} loading={loading} result={result} onPick={(c) => setEmoji(graphemes(c))} />
            </div>
          </Card>

          <Card pop={4}>
            <Label className="mb-1">4 · Picture <span className="normal-case tracking-normal text-ink-soft">· optional</span></Label>
            <p className="mb-3 text-[13px] text-ink-soft">a picture for your moji. it becomes the token image, the share card and the tile everywhere. a line about it and your links show on its page. you can add or change all of it later.</p>
            <MemePicker value={meme} onChange={setMeme} />
            <MemeDetailsFields value={details} onChange={setDetails} className="mt-3" />
          </Card>
        </>
      ) : (
        <Card pop={3}>
          <Label className="mb-3">3 · Your meme</Label>
          <MemeSlots name={name} symbol={symbol} onName={setName} onSymbol={setSymbol} />
          <div className="mt-3">
            <AvailabilityLine combo={combo} loading={loading} result={result} onPick={() => {}} empty={memeHint && !combo ? memeHint : "pick a ticker"} taken="ticker taken on this pair" />
          </div>
          <p className="mb-3 mt-4 text-[13px] text-ink-soft">the picture is the token image, the share card and the tile everywhere. a line about it and your links show on its page.</p>
          <MemePicker value={meme} onChange={setMeme} label="add the picture" />
          {combo && memeHint && <p className="heading mt-2 text-center text-[13px] text-ink-soft">{memeHint}</p>}
          <MemeDetailsFields value={details} onChange={setDetails} className="mt-3" />
        </Card>
      )}

      {chain.key !== "solana" && (
        <>
          <CreatorFeesCard value={feeRecipient} onChange={setFeeRecipient} />
          <DevBuyCard chain={chain} stock={stock} value={devBuyIn} onChange={setDevBuyIn} />
        </>
      )}

      {chain.key === "solana" ? (
        <Button size="lg" disabled className="pop pop-4">
          Solana soon
        </Button>
      ) : PRIVY_ENABLED ? (
        <LaunchAction chain={chain} stock={stock} combo={combo} available={available} curve={curve} meme={meme} details={details} kind={kind} name={name.trim()} symbol={symbol} feeRecipient={feeRecipient} devBuyIn={devBuyIn} />
      ) : (
        <LaunchActionDisabled combo={combo} stock={stock} available={available} />
      )}

      <Advanced value={curve} onChange={setCurve} />

      <p className="text-center text-[12px] text-ink-soft">
        one wallet signature. gas is on moji on Robinhood Chain; elsewhere you pay it.
      </p>
    </main>
  );
}
