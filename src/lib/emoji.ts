import emojiRegex from "emoji-regex";

const VARIATION_SELECTORS = /[︎️]/g;
// Fitzpatrick skin tone modifiers U+1F3FB..U+1F3FF
const SKIN_TONES = /[\u{1F3FB}-\u{1F3FF}]/gu;
const LATIN = /[A-Za-z]/;

export const MAX_EMOJI = 3;

/** Split a string into user-perceived characters (graphemes). */
export function graphemes(input: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(input), (s) => s.segment);
  }
  return Array.from(input);
}

/** True if the whole grapheme is a single emoji. */
export function isEmoji(g: string): boolean {
  if (!g || LATIN.test(g)) return false;
  const re = emojiRegex();
  const m = g.match(re);
  return !!m && m.length === 1 && m[0] === g;
}

/**
 * Normalize a combo for uniqueness comparison:
 * strip variation selectors and skin tone modifiers so 👍 and 👍🏽 collide.
 */
export function normalizeCombo(input: string): string {
  return input.replace(SKIN_TONES, "").replace(VARIATION_SELECTORS, "").trim();
}

export type ComboValidation =
  | { ok: true; emoji: string[]; display: string; normalized: string }
  | { ok: false; reason: string };

/** Validate a combo: 1 to 3 emoji, nothing else, no Latin characters. */
export function validateCombo(input: string): ComboValidation {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "Pick at least one emoji" };
  if (LATIN.test(raw)) return { ok: false, reason: "Emoji only, no letters" };
  const parts = graphemes(raw);
  if (parts.length > MAX_EMOJI) return { ok: false, reason: `Max ${MAX_EMOJI} emoji` };
  for (const p of parts) {
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
