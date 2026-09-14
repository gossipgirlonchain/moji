import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties } from "react";
import { INK } from "@/config/design";

/**
 * Emoji for the card renderer. satori does not draw emoji from system fonts, so every emoji is drawn as an
 * image and the output is identical on every OS. The source is Noto Color Emoji SVG, pinned to one release.
 *
 * Drawing SVGs directly costs resvg ~130ms per glyph and a blurred shadow far more, so each emoji is turned
 * into two PNG sprites once: the glyph, and its shadow (the glyph's silhouette, blurred, in --ink; opacity
 * and offset are applied at draw time so one sprite serves every shadow spec). The scatter pool ships
 * pre-baked in src/assets/emoji (`npm run cards:assets`); anything else (a claimed combo, a skin tone, a ZWJ
 * sequence) is fetched from Noto, rasterised on first use and cached in memory.
 */
const NOTO_SHA = "8998f5dd683424a73e2314a8c1f1e359c19e8742";
const NOTO_BASE = (process.env.NOTO_EMOJI_BASE_URL || `https://raw.githubusercontent.com/googlefonts/noto-emoji/${NOTO_SHA}`).replace(/\/$/, "");
export const EMOJI_DIR = path.join(process.cwd(), "src", "assets", "emoji");
const FALLBACK = "🫥";

/**
 * Sprite geometry: glyph rasterised at SPRITE px; the shadow sprite adds SHADOW_PAD px of blur room on each
 * side and is stored at half resolution (it is soft, so upscaling is invisible and the PNG is 4x smaller).
 */
export const SPRITE = 192;
export const SHADOW_PAD = 40;
const SHADOW_SCALE = 0.5;
/** Shadow softness baked into the sprite: a 9px blur on a 100px emoji, so it scales with the drawn size. */
const SHADOW_SIGMA = (9 / 2) * (SPRITE / 100);

/** Noto file stem: code points joined with "_", variation selectors dropped. 👍🏽 -> 1f44d_1f3fd */
export function notoCode(grapheme: string): string {
  return Array.from(grapheme)
    .map((c) => c.codePointAt(0) ?? 0)
    .filter((cp) => cp !== 0xfe0f && cp !== 0xfe0e)
    .map((cp) => cp.toString(16))
    .join("_");
}

const isFlag = (grapheme: string) =>
  Array.from(grapheme).every((c) => {
    const cp = c.codePointAt(0) ?? 0;
    return cp >= 0x1f1e6 && cp <= 0x1f1ff;
  });

async function readLocal(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(EMOJI_DIR, name));
  } catch {
    return null;
  }
}

async function fetchRemote(grapheme: string, code: string): Promise<string | null> {
  const url = isFlag(grapheme) ? `${NOTO_BASE}/third_party/region-flags/waved-svg/emoji_u${code}.svg` : `${NOTO_BASE}/svg/emoji_u${code}.svg`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "force-cache" });
    if (!r.ok) return null;
    const text = await r.text();
    return text.includes("<svg") ? text : null;
  } catch {
    return null;
  }
}

const svgCache = new Map<string, Promise<string | null>>();
/** Raw Noto SVG for one grapheme (bundled file first, then the pinned release), or null when it exists nowhere. */
export function loadEmojiSvg(grapheme: string): Promise<string | null> {
  const code = notoCode(grapheme);
  if (!code) return Promise.resolve(null);
  let p = svgCache.get(code);
  if (!p) {
    p = (async () => (await readLocal(`${code}.svg`))?.toString("utf8") ?? (await fetchRemote(grapheme, code)))();
    svgCache.set(code, p);
    p.then((v) => v === null && svgCache.delete(code)).catch(() => svgCache.delete(code));
  }
  return p;
}

const VIEWBOX = 128;
/** Strip the XML prologue and fixed dimensions so the glyph fills a 128 unit box. */
function inner(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${VIEWBOX}" height="${VIEWBOX}">`)
    .trim();
}
const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Rasterise a Noto SVG to a SPRITE px PNG (transparent). */
export async function rasterGlyph(svg: string): Promise<Buffer> {
  const src = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${inner(svg)}</svg>`);
  const res = new ImageResponse(
    (
      <div style={{ width: SPRITE, height: SPRITE, display: "flex", background: "transparent" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={SPRITE} height={SPRITE} alt="" />
      </div>
    ),
    { width: SPRITE, height: SPRITE },
  );
  return Buffer.from(await res.arrayBuffer());
}

/** Rasterise the shadow sprite: the glyph's silhouette blurred and filled with --ink, centred with SHADOW_PAD around. */
export async function rasterShadow(svg: string): Promise<Buffer> {
  const total = Math.round((SPRITE + 2 * SHADOW_PAD) * SHADOW_SCALE);
  const k = VIEWBOX / SPRITE;
  const pad = SHADOW_PAD * k;
  const box = VIEWBOX + 2 * pad;
  const src = svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${box} ${box}">` +
      `<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${(SHADOW_SIGMA * k).toFixed(3)}" result="b"/>` +
      `<feFlood flood-color="${INK}" flood-opacity="1"/><feComposite in2="b" operator="in"/></filter></defs>` +
      `<g filter="url(#s)">${inner(svg)}</g></svg>`,
  );
  const res = new ImageResponse(
    (
      <div style={{ width: total, height: total, display: "flex", background: "transparent" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={total} height={total} alt="" />
      </div>
    ),
    { width: total, height: total },
  );
  return Buffer.from(await res.arrayBuffer());
}

export type Sprite = { glyph: string; shadow: string | null };
export type Sprites = Map<string, Sprite>;

const pngDataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
const spriteCache = new Map<string, Promise<string | null>>();

/** Data URL of one sprite layer, from the bundled PNG, else rasterised from the SVG once per instance. */
function spriteLayer(grapheme: string, layer: "glyph" | "shadow"): Promise<string | null> {
  const code = notoCode(grapheme);
  const key = `${code}:${layer}`;
  let p = spriteCache.get(key);
  if (!p) {
    p = (async () => {
      const local = await readLocal(layer === "glyph" ? `${code}.png` : `${code}.shadow.png`);
      if (local) return pngDataUrl(local);
      const svg = await loadEmojiSvg(grapheme);
      if (!svg) return null;
      return pngDataUrl(layer === "glyph" ? await rasterGlyph(svg) : await rasterShadow(svg));
    })();
    spriteCache.set(key, p);
    p.then((v) => v === null && spriteCache.delete(key)).catch(() => spriteCache.delete(key));
  }
  return p;
}

/**
 * Resolve every grapheme a card needs, in parallel. `shadowed` graphemes also get their shadow layer.
 * Unknown emoji fall back to 🫥 so a card never renders tofu.
 */
export async function resolveSprites(plain: Iterable<string>, shadowed: Iterable<string> = []): Promise<Sprites> {
  const needShadow = new Set([...shadowed].filter(Boolean));
  const all = new Set([...plain, ...needShadow].filter(Boolean));
  const out: Sprites = new Map();
  const fallbackGlyph = await spriteLayer(FALLBACK, "glyph");
  await Promise.all(
    [...all].map(async (g) => {
      const [glyph, shadow] = await Promise.all([spriteLayer(g, "glyph"), needShadow.has(g) ? spriteLayer(g, "shadow") : Promise.resolve(null)]);
      const ok = glyph ?? fallbackGlyph;
      if (ok) out.set(g, { glyph: ok, shadow: glyph ? shadow : null });
    }),
  );
  return out;
}

export type Shadow = { dx: number; dy: number; alpha: number };
/** The clay shadows from the handoff (offset and opacity; softness scales with size, see SHADOW_SIGMA). */
export const SHADOW = {
  small: { dx: 5, dy: 6, alpha: 0.24 },
  medium: { dx: 6, dy: 7, alpha: 0.25 },
  large: { dx: 7, dy: 9, alpha: 0.26 },
  row: { dx: 6, dy: 8, alpha: 0.22 },
  hero: { dx: 10, dy: 14, alpha: 0.24 },
} as const satisfies Record<string, Shadow>;

/** One emoji drawn at `size` px, optionally with its clay shadow, optionally rotated. */
export function Emoji({ sprites, emoji, size, shadow, rotate, style }: { sprites: Sprites; emoji: string; size: number; shadow?: Shadow; rotate?: number; style?: CSSProperties }) {
  const s = sprites.get(emoji);
  const padPx = (size * SHADOW_PAD) / SPRITE;
  const shadowBox = size + 2 * padPx;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", flexShrink: 0, ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}), ...style }}>
      {shadow && s?.shadow ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.shadow} width={shadowBox} height={shadowBox} alt="" style={{ position: "absolute", left: -padPx + shadow.dx, top: -padPx + shadow.dy, width: shadowBox, height: shadowBox, opacity: shadow.alpha }} />
      ) : null}
      {s ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.glyph} width={size} height={size} alt="" style={{ position: "absolute", left: 0, top: 0, width: size, height: size }} />
      ) : null}
    </div>
  );
}
