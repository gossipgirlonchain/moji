/**
 * Memes: traditional memecoin launches next to mojis. A meme has a title and a ticker instead of an emoji combo,
 * always carries a picture, and lives in the same `mojis` table with `kind = 'meme'`.
 *
 * Identity: the ticker doubles as the claim. `display` is `$PEPE`, `combo` (the claim key) is `$pepe`, so every
 * surface keyed on combo (URLs, claims, the meme API, trades) works unchanged and nothing collides with an emoji
 * combo (validateCombo rejects `$`). Isomorphic: no server imports.
 */
import { normalizeCombo } from "./emoji";

export type LaunchKind = "moji" | "meme";

export const MEME_NAME_MAX = 32;
export const MEME_SYMBOL_RE = /^[A-Z0-9]{2,10}$/;

export type MemeValidation = { ok: true; name: string; symbol: string; display: string; normalized: string } | { ok: false; reason: string };

/** Title 1 to 32 characters, ticker 2 to 10 letters or digits (upper-cased). */
export function validateMeme(input: { name?: string | null; symbol?: string | null }): MemeValidation {
  const name = (input.name ?? "").replace(/\s+/g, " ").trim();
  const symbol = (input.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  if (!name) return { ok: false, reason: "Give it a title" };
  if (name.length > MEME_NAME_MAX) return { ok: false, reason: `Titles are capped at ${MEME_NAME_MAX} characters` };
  if (!symbol) return { ok: false, reason: "Pick a ticker" };
  if (!MEME_SYMBOL_RE.test(symbol)) return { ok: false, reason: "Tickers are 2 to 10 letters or digits" };
  return { ok: true, name, symbol, display: `$${symbol}`, normalized: `$${symbol.toLowerCase()}` };
}

/** A `$TICKER` display or `$ticker` combo is a meme; anything else is an emoji combo. */
export function isMemeCombo(s: string | null | undefined): boolean {
  return typeof s === "string" && s.startsWith("$");
}

/** The claim key for either kind: `$ticker` for a meme, the variation-selector-stripped combo for a moji. */
export function normalizeAny(input: string): string {
  return isMemeCombo(input) ? input.trim().toLowerCase() : normalizeCombo(input);
}

type Named = { kind?: string | null; name?: string | null; display: string; stock_ticker?: string };

export function isMeme(m: { kind?: string | null; display?: string }): boolean {
  return m.kind === "meme" || isMemeCombo(m.display);
}

/** Headline for a tile or row: the title for a meme, `🍏 / AAPL` for a moji. */
export function mojiTitle(m: Named): string {
  if (isMeme(m) && m.name) return m.name;
  return m.stock_ticker ? `${m.display} / ${m.stock_ticker}` : m.display;
}

/** Second line under a meme's title: `$PEPE / ETH`. Empty for a moji (its headline already says it). */
export function mojiSub(m: Named): string {
  return isMeme(m) && m.name && m.stock_ticker ? `${m.display} / ${m.stock_ticker}` : "";
}
