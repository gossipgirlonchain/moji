import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLAY, INK, INK_SOFT, SKY } from "@/config/design";

/**
 * Deterministic emoji rendering: next/og (satori) with Noto Color Emoji, so the PNG is identical
 * on every OS. Colors and the clay shadow come from the shared design tokens (src/config/design.ts).
 */
const SKY_GRADIENT = `linear-gradient(145deg, ${SKY[50]} 0%, ${SKY[200]} 55%, ${SKY[300]} 100%)`;
const CLAY_SHADOW = CLAY;

let wordmarkCache: string | null = null;
/** public/moji.png as a data URL, shared by the OG image and the social cards. */
export async function wordmarkDataUrl(): Promise<string> {
  if (wordmarkCache) return wordmarkCache;
  const buf = await readFile(path.join(process.cwd(), "public", "moji.png"));
  wordmarkCache = `data:image/png;base64,${buf.toString("base64")}`;
  return wordmarkCache;
}

/** 512x512 token image: emoji centered on a sky clay circle, transparent outside. */
export function renderTokenImage(combo: string, size = 512): ImageResponse {
  const count = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(combo)).length;
  const fontSize = count === 1 ? size * 0.52 : count === 2 ? size * 0.34 : size * 0.24;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        <div
          style={{
            width: size * 0.9,
            height: size * 0.9,
            borderRadius: 9999,
            background: SKY_GRADIENT,
            boxShadow: CLAY_SHADOW,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize,
            lineHeight: 1,
            letterSpacing: count > 1 ? "-0.04em" : "0",
          }}
        >
          {combo}
        </div>
      </div>
    ),
    { width: size, height: size, emoji: "noto" },
  );
}

/** 1200x630 Open Graph card: the meme (or the emoji circle), "🍏 / AAPL", wordmark. */
export async function renderOgImage(combo: string, ticker: string, memeUrl?: string | null): Promise<ImageResponse> {
  const wordmark = await wordmarkDataUrl();
  const art = memeUrl ? (
    <div style={{ width: 360, height: 360, borderRadius: 48, overflow: "hidden", boxShadow: CLAY_SHADOW, display: "flex", position: "relative", background: SKY[100] }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={memeUrl} width={360} height={360} alt="" style={{ objectFit: "cover", width: 360, height: 360 }} />
      <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex", padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.92)", fontSize: 56, lineHeight: 1 }}>{combo}</div>
    </div>
  ) : (
    <div
      style={{
        width: 330,
        height: 330,
        borderRadius: 9999,
        background: SKY_GRADIENT,
        boxShadow: CLAY_SHADOW,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 180,
        lineHeight: 1,
      }}
    >
      {combo}
    </div>
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: SKY[100],
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 1040,
            height: 470,
            borderRadius: 64,
            background: "#FFFFFF",
            boxShadow: CLAY_SHADOW,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 72px",
          }}
        >
          {art}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wordmark} width={300} height={155} alt="moji" style={{ objectFit: "contain" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 84, fontWeight: 700, color: INK }}>
              <span>{combo}</span>
              <span style={{ color: INK_SOFT }}>/</span>
              <span>{ticker}</span>
            </div>
            <div style={{ color: INK_SOFT, fontSize: 26, fontWeight: 700 }}>moji.wtf</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, emoji: "noto" },
  );
}
