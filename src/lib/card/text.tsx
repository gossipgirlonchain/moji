import "server-only";
import type { CSSProperties, ReactNode } from "react";
import { FONT } from "@/config/design";
import { graphemes, isEmoji } from "@/lib/emoji";
import { FREDOKA_600, NUNITO_800, measure, type FontMetrics } from "./metrics";
import { Emoji, type Shadow, type Sprites } from "./emoji";

/**
 * Text helpers for the card templates. Copy can contain emoji (a pair like "🧇 / $TSM"), which satori
 * cannot draw from a font, so text is split into word and emoji tokens: emoji become inline images and
 * words stay real text. Widths are measured with the bundled font metrics so copy shrinks instead of
 * overflowing. Plain copy without emoji uses satori's own wrapping (with text-wrap: balance).
 */
export type Token = { kind: "word"; value: string } | { kind: "emoji"; value: string };
/** Inline emoji size relative to the font size, and the gap between tokens (matches the fonts' space width). */
export const INLINE_EMOJI = 1.08;
export const TOKEN_GAP = 0.25;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let word = "";
  const flush = () => {
    if (word) out.push({ kind: "word", value: word });
    word = "";
  };
  for (const g of graphemes(text)) {
    if (g === " ") flush();
    else if (isEmoji(g)) {
      flush();
      out.push({ kind: "emoji", value: g });
    } else word += g;
  }
  flush();
  return out;
}

export const hasEmoji = (text: string) => tokenize(text).some((t) => t.kind === "emoji");
export const emojiIn = (text: string): string[] => tokenize(text).filter((t) => t.kind === "emoji").map((t) => t.value);

export const metricsFor = (font: string): FontMetrics => (font === FONT.body ? NUNITO_800 : FREDOKA_600);

/** satori throws on `undefined` style values, so drop them. */
export function css(style: CSSProperties): CSSProperties {
  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined)) as CSSProperties;
}

function tokenWidth(t: Token, size: number, font: FontMetrics, letterSpacingEm: number): number {
  return t.kind === "emoji" ? INLINE_EMOJI * size : measure(t.value, size, font, letterSpacingEm);
}

/** Width of copy laid out on one line. */
export function lineWidth(text: string, size: number, font = FREDOKA_600, letterSpacingEm = 0): number {
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  const words = tokens.reduce((w, t) => w + tokenWidth(t, size, font, letterSpacingEm), 0);
  return words + (tokens.length - 1) * TOKEN_GAP * size;
}

/** Greedy word wrap, returns the number of lines needed. */
export function countLines(text: string, size: number, maxWidth: number, font = FREDOKA_600): number {
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  let lines = 1;
  let x = 0;
  for (const t of tokens) {
    const w = tokenWidth(t, size, font, 0);
    if (x === 0) x = w;
    else if (x + TOKEN_GAP * size + w <= maxWidth) x += TOKEN_GAP * size + w;
    else {
      lines++;
      x = w;
    }
  }
  return lines;
}

/** Largest size from the scale that fits on one line, never below `min`. */
export function fitLine(text: string, sizes: number[], maxWidth: number, font = FREDOKA_600, letterSpacingEm = 0, min = 24): number {
  for (const s of sizes) if (lineWidth(text, s, font, letterSpacingEm) <= maxWidth) return s;
  const last = sizes[sizes.length - 1];
  return Math.max(min, Math.floor((last * maxWidth) / Math.max(1, lineWidth(text, last, font, letterSpacingEm))));
}

/** Largest size from the scale where the copy wraps to at most `maxLines` and fits `maxHeight`. */
export function fitBlock(text: string, sizes: number[], maxWidth: number, maxHeight: number, lineHeight: number, maxLines = 3, font = FREDOKA_600): { size: number; lines: number } {
  let best = { size: sizes[sizes.length - 1], lines: countLines(text, sizes[sizes.length - 1], maxWidth, font) };
  for (const s of sizes) {
    const lines = countLines(text, s, maxWidth, font);
    if (lines <= maxLines && lines * s * lineHeight <= maxHeight) return { size: s, lines };
    best = { size: s, lines };
  }
  // Nothing on the scale fits: keep shrinking by 8 until it does.
  for (let s = best.size - 8; s >= 28; s -= 8) {
    const lines = countLines(text, s, maxWidth, font);
    if (lines <= maxLines && lines * s * lineHeight <= maxHeight) return { size: s, lines };
  }
  return best;
}

export type RichProps = {
  text: string;
  sprites: Sprites;
  size: number;
  color: string;
  font?: string;
  lineHeight?: number;
  letterSpacingEm?: number;
  align?: "left" | "center";
  wrap?: boolean;
  maxWidth?: number;
  style?: CSSProperties;
};

/**
 * Text that may contain emoji. Without emoji it is a single text node so satori wraps and balances it.
 * With emoji it is a row of word and emoji tokens; wrapping happens per token.
 */
export function Rich({ text, sprites, size, color, font = FONT.heading, lineHeight = 1, letterSpacingEm = 0, align = "left", wrap = false, maxWidth, style }: RichProps): ReactNode {
  const base: CSSProperties = { fontFamily: font, fontWeight: font === FONT.body ? 800 : 600, fontSize: size, lineHeight, color, letterSpacing: letterSpacingEm ? `${letterSpacingEm * size}px` : undefined };
  const tokens = tokenize(text);
  if (!tokens.some((t) => t.kind === "emoji")) {
    return (
      <div style={css({ ...base, display: "flex", textAlign: align, textWrap: wrap ? "balance" : undefined, whiteSpace: wrap ? "normal" : "nowrap", maxWidth, ...style } as CSSProperties)}>
        {text}
      </div>
    );
  }
  const emojiSize = Math.round(size * INLINE_EMOJI);
  return (
    <div style={css({ display: "flex", flexDirection: "row", flexWrap: wrap ? "wrap" : "nowrap", alignItems: "center", justifyContent: align === "center" ? "center" : "flex-start", gap: Math.round(TOKEN_GAP * size), maxWidth, ...style })}>
      {tokens.map((t, i) =>
        t.kind === "emoji" ? (
          <Emoji key={i} sprites={sprites} emoji={t.value} size={emojiSize} />
        ) : (
          <span key={i} style={css({ ...base, whiteSpace: "nowrap" })}>
            {t.value}
          </span>
        ),
      )}
    </div>
  );
}

/** A combo (1 to 3 emoji) as a row of sprites that fits a `width` px cell. */
export function ComboEmoji({ sprites, combo, width, size, shadow, overlap = 0 }: { sprites: Sprites; combo: string; width?: number; size: number; shadow?: Shadow; overlap?: number }) {
  const parts = graphemes(combo).filter((g) => g.trim());
  const n = Math.max(1, parts.length);
  const each = width ? Math.min(size, Math.floor((width + overlap * (n - 1)) / n)) : size;
  return (
    <div style={css({ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", width, height: each, flexShrink: 0 })}>
      {parts.map((g, i) => (
        <Emoji key={i} sprites={sprites} emoji={g} size={each} shadow={shadow} style={i ? { marginLeft: -overlap } : undefined} />
      ))}
    </div>
  );
}
