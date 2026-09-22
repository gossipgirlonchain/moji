/**
 * MEME launches: a traditional memecoin (name, ticker, picture) paired to a stock or token, launched on Doppler
 * exactly like a moji. Rows live in `mojis` with kind = "meme"; the emoji-shaped `combo` column holds a
 * synthetic key so the claims index still enforces "one ticker per pair per chain" and every per-moji route,
 * cron and query keeps working. Client-safe, no server imports.
 */
export const MEME_NAME_MAX = 32;
export const MEME_SYMBOL_MIN = 2;
export const MEME_SYMBOL_MAX = 10;
const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;
const KEY_PREFIX = "meme:";

export type MemeRowKey = { kind?: string | null; symbol?: string | null; name?: string | null };

export function isMemeRow(m: MemeRowKey): boolean {
  return m.kind === "meme";
}

export function normalizeSymbol(input: string): string {
  return (input ?? "").trim().replace(/^\$/, "").toUpperCase();
}

export function validateMemeName(input: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = (input ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, reason: "Give it a name" };
  if (name.length > MEME_NAME_MAX) return { ok: false, reason: `Name is max ${MEME_NAME_MAX} characters` };
  if (/[\u0000-\u001f<>]/.test(name)) return { ok: false, reason: "Name has characters we can't use" };
  return { ok: true, name };
}

export function validateMemeSymbol(input: string): { ok: true; symbol: string } | { ok: false; reason: string } {
  const symbol = normalizeSymbol(input);
  if (!symbol) return { ok: false, reason: "Pick a ticker" };
  if (symbol.length < MEME_SYMBOL_MIN) return { ok: false, reason: `Ticker is at least ${MEME_SYMBOL_MIN} characters` };
  if (symbol.length > MEME_SYMBOL_MAX) return { ok: false, reason: `Ticker is max ${MEME_SYMBOL_MAX} characters` };
  if (!SYMBOL_RE.test(symbol)) return { ok: false, reason: "Ticker is letters and digits only" };
  return { ok: true, symbol };
}

/** The `combo` a meme occupies in `claims` / `mojis`: unique per chain + numeraire + ticker. */
export function memeCombo(chainId: number, numeraire: string, symbol: string): string {
  return `${KEY_PREFIX}${chainId}:${numeraire.toLowerCase()}:${normalizeSymbol(symbol)}`;
}

export function isMemeCombo(combo: string): boolean {
  return combo.startsWith(KEY_PREFIX);
}

/** What a meme shows wherever a moji shows its emoji: the ticker with a dollar sign. */
export function memeDisplay(symbol: string): string {
  return `$${normalizeSymbol(symbol)}`;
}

/** On-chain tokenURI for a meme (known before the row exists, like a moji's). */
export function memeMetaUrl(siteUrl: string, symbol: string, chainId: number, numeraire: string): string {
  return `${siteUrl}/api/meta/meme/${encodeURIComponent(normalizeSymbol(symbol))}?chain=${chainId}&pair=${numeraire}`;
}
