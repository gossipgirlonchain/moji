"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MemePicker } from "@/components/MemePicker";
import { MEME_NAME_MAX, MEME_SYMBOL_MAX, normalizeSymbol, validateMemeName, validateMemeSymbol } from "@/lib/memecoin";

export type MemeDraft = { name: string; symbol: string; file: File | null };
export type MemeCheck = { valid: boolean; symbol?: string; reason?: string; claimed: boolean; needsPair?: boolean; owner?: { display: string; href: string } };

/** Live "one ticker per pair per chain" check, debounced 250ms. */
export function useMemeAvailability(symbol: string, chainId: number, pair: string | undefined) {
  const [state, setState] = useState<{ loading: boolean; result: MemeCheck | null }>({ loading: false, result: null });
  useEffect(() => {
    const sy = normalizeSymbol(symbol);
    if (!sy) {
      setState({ loading: false, result: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/memes/check?symbol=${encodeURIComponent(sy)}&chainId=${chainId}&pair=${pair ?? ""}`, { cache: "no-store" });
        const j = (await r.json()) as MemeCheck;
        if (alive) setState({ loading: false, result: j });
      } catch {
        if (alive) setState({ loading: false, result: null });
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [symbol, chainId, pair]);
  return state;
}

/** Everything a MEME launch is ready to go with: valid name, an open ticker on this pair, and a picture. */
export function memeReady(d: MemeDraft, check: MemeCheck | null, loading: boolean): boolean {
  return validateMemeName(d.name).ok && validateMemeSymbol(d.symbol).ok && Boolean(d.file) && !loading && Boolean(check?.valid) && !check?.claimed && !check?.needsPair;
}

/** Step 3 for a MEME launch: name, ticker, picture. */
export function MemeFields({ value, onChange, chainId, pair }: { value: MemeDraft; onChange: (d: MemeDraft) => void; chainId: number; pair: string | undefined }) {
  const { loading, result } = useMemeAvailability(value.symbol, chainId, pair);
  const name = validateMemeName(value.name);
  const symbol = validateMemeSymbol(value.symbol);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_130px] gap-2">
        <input
          className="clay-input"
          placeholder="name · Pepe the Frog"
          maxLength={MEME_NAME_MAX}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          autoComplete="off"
        />
        <input
          className="clay-input heading uppercase"
          placeholder="TICKER"
          maxLength={MEME_SYMBOL_MAX}
          value={value.symbol}
          onChange={(e) => onChange({ ...value, symbol: normalizeSymbol(e.target.value) })}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <MemePicker value={value.file} onChange={(file) => onChange({ ...value, file })} label="add a picture" changeLabel="change picture" />
      <MemeLine value={value} nameOk={name.ok ? null : value.name ? name.reason : null} symbolOk={symbol.ok ? null : value.symbol ? symbol.reason : null} loading={loading} result={result} />
    </div>
  );
}

function MemeLine({ value, nameOk, symbolOk, loading, result }: { value: MemeDraft; nameOk: string | null; symbolOk: string | null; loading: boolean; result: MemeCheck | null }) {
  if (!value.symbol && !value.name) return <p className="heading text-center text-[15px] text-ink-soft">a name, a ticker and a picture</p>;
  if (symbolOk) return <p className="heading text-center text-[15px] text-coral">{symbolOk}</p>;
  if (nameOk) return <p className="heading text-center text-[15px] text-coral">{nameOk}</p>;
  if (!value.symbol) return <p className="heading text-center text-[15px] text-ink-soft">pick a ticker</p>;
  if (loading || !result) return <p className="heading text-center text-[15px] text-ink-soft">checking…</p>;
  if (!result.valid) return <p className="heading text-center text-[15px] text-coral">{result.reason}</p>;
  if (result.needsPair) return <p className="heading text-center text-[15px] text-ink-soft">pick a stock or token to check</p>;
  if (result.claimed) {
    return (
      <div className="text-center">
        <p className="heading text-[18px] uppercase tracking-[0.12em] text-coral">
          <span className="mr-1">●</span> ${result.symbol} is taken on this pair
        </p>
        {result.owner && (
          <Link href={result.owner.href} className="heading text-[13px] text-sky-600 underline underline-offset-4">
            see {result.owner.display}
          </Link>
        )}
      </div>
    );
  }
  if (!value.file) return <p className="heading text-center text-[15px] text-ink-soft">${result.symbol} is open · add a picture</p>;
  if (!value.name) return <p className="heading text-center text-[15px] text-ink-soft">${result.symbol} is open · give it a name</p>;
  return (
    <p className="heading text-center text-[18px] uppercase tracking-[0.12em] text-mint">
      <span className="mr-1">●</span> ${result.symbol} available
    </p>
  );
}
