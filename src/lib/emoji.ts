import emojiRegex from "emoji-regex";

/**
 * Exact claim rules:
 * - segment with Intl.Segmenter (grapheme); a combo is 1 to 3 graphemes, never string length
 * - a ZWJ sequence like 👨‍👩‍👧 is ONE emoji
 * - skin tone modifiers are PRESERVED: 👍 and 👍🏽 are two claims
 * - variation selectors (U+FE0F / U+FE0E) are STRIPPED before comparison: ✌️ and ✌ are one claim
 * - anything that is not an emoji grapheme is rejected: digits, keycaps (1️⃣, #️⃣), Latin letters
 */
const VARIATION_SELECTORS = /[︎️]/g;
const LATIN = /[A-Za-z]/;
const KEYCAP = /⃣/;
const DIGIT_OR_SYMBOL_BASE = /^[0-9#*]/;

export const MAX_EMOJI = 3;

/** Split a string into user-perceived characters (graphemes). */
export function graphemes(input: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(seg.segment(input), (s) => s.segment);
}

/** True if the whole grapheme is exactly one emoji and not a keycap / digit / letter. */
export function isEmoji(g: string): boolean {
  if (!g || LATIN.test(g) || KEYCAP.test(g) || DIGIT_OR_SYMBOL_BASE.test(g)) return false;
  const re = emojiRegex();
  const m = g.match(re);
  return !!m && m.length === 1 && m[0] === g;
}

/** Normalize a combo for uniqueness comparison: strip variation selectors only. Skin tones stay. */
export function normalizeCombo(input: string): string {
  return input.replace(VARIATION_SELECTORS, "").trim();
}

export type ComboValidation =
  | { ok: true; emoji: string[]; display: string; normalized: string }
  | { ok: false; reason: string };

/** Validate a combo: 1 to 3 emoji graphemes, nothing else. */
export function validateCombo(input: string): ComboValidation {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "Pick at least one emoji" };
  if (LATIN.test(raw)) return { ok: false, reason: "Emoji only, no letters" };
  const parts = graphemes(raw);
  if (parts.length > MAX_EMOJI) return { ok: false, reason: `Max ${MAX_EMOJI} emoji` };
  for (const p of parts) {
    if (KEYCAP.test(p) || DIGIT_OR_SYMBOL_BASE.test(p)) return { ok: false, reason: "No digits or keycaps" };
    if (!isEmoji(p)) return { ok: false, reason: "Emoji only" };
  }
  const normalized = normalizeCombo(raw);
  if (!normalized) return { ok: false, reason: "Pick at least one emoji" };
  return { ok: true, emoji: parts, display: raw, normalized };
}

/** Pool of extension emoji used to suggest available combos when one is claimed. */
export const EXTENSION_POOL = [
  "💻", "📱", "🚀", "🔥", "💎", "🌙", "⚡", "🧠", "🦾", "🎯", "🌈", "🍀", "🪙", "📈", "🛸", "🧊",
  "🍒", "🌊", "🐸", "🦄", "👑", "🎲", "🧲", "🔮", "🍩", "🎈", "🐳", "🦊", "🌵", "🍄", "🧬", "🎸",
];

export function encodeCombo(display: string): string {
  return encodeURIComponent(display);
}
export function decodeCombo(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/** Stable, filesystem-safe key for a normalized combo (hex of UTF-8). */
export function comboKey(normalized: string): string {
  return Array.from(new TextEncoder().encode(normalized), (b) => b.toString(16).padStart(2, "0")).join("");
}
