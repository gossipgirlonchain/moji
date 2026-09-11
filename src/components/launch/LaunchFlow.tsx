"use client";

import { useMemo, useState } from "react";
import { Card, Label } from "@/components/ui";
import { DEFAULT_CHAIN, type MojiChain } from "@/config/chains";
import { stocksFor, type Stock } from "@/config/stocks";
import { CURVE_DEFAULTS, type CurveDefaults } from "@/config/curve";
import { graphemes } from "@/lib/emoji";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { ChainPills } from "./ChainPills";
import { StockList } from "./StockList";
import { EmojiSlots } from "./EmojiSlots";
import { AvailabilityLine, useAvailability } from "./Availability";
import { Advanced } from "./Advanced";
import { LaunchAction, LaunchActionDisabled } from "./LaunchAction";

export function LaunchFlow() {
  const [chain, setChain] = useState<MojiChain>(DEFAULT_CHAIN);
  const [stock, setStock] = useState<Stock | undefined>(undefined);
  const [emoji, setEmoji] = useState<string[]>([]);
  const [curve, setCurve] = useState<CurveDefaults>(CURVE_DEFAULTS);

  const stocks = useMemo(() => stocksFor(chain.chainId), [chain]);
  const combo = emoji.join("");
  const { loading, result } = useAvailability(combo);
  const available = Boolean(combo && !loading && result?.valid && !result.claimed);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">launch a moji</h1>

      <Card pop={1}>
        <Label className="mb-3">1 · Chain</Label>
        <ChainPills
          value={chain}
          onChange={(c) => {
            setChain(c);
            setStock(undefined);
          }}
        />
      </Card>

      <Card pop={2}>
        <Label className="mb-3">2 · Stock {stock ? `· ${stock.ticker}` : ""}</Label>
        <StockList stocks={stocks} value={stock} onChange={setStock} />
      </Card>

      <Card pop={3}>
        <Label className="mb-3">3 · Your moji</Label>
        <EmojiSlots emoji={emoji} onChange={setEmoji} />
        <div className="mt-4">
          <AvailabilityLine combo={combo} loading={loading} result={result} onPick={(c) => setEmoji(graphemes(c))} />
        </div>
      </Card>

      {PRIVY_ENABLED ? (
        <LaunchAction chain={chain} stock={stock} combo={combo} available={available} curve={curve} />
      ) : (
        <LaunchActionDisabled combo={combo} stock={stock} />
      )}

      <Advanced value={curve} onChange={setCurve} />

      <p className="text-center text-[12px] text-ink-soft">
        one wallet signature. you pay gas. your combo is yours forever.
      </p>
    </main>
  );
}
