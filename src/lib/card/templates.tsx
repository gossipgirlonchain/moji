import "server-only";
import type { ReactNode } from "react";
import { FONT, INK, INK_SOFT, MINT, RADIUS, SKY } from "@/config/design";
import { graphemes } from "@/lib/emoji";
import { ARTBOARD_INSET, CARD_PADDING, type Placement } from "./scatter";
import { Emoji, SHADOW, type Sprites } from "./emoji";
import { ClayBox, ClayCard, type ClayBg, type ClaySet } from "./clay";
import { dollar, type CardSpec, type Fields } from "./params";
import { ComboEmoji, Rich, fitBlock, fitLine, lineWidth } from "./text";
import { FREDOKA_600, NUNITO_800 } from "./metrics";

/**
 * The six social templates from the design handoff, as satori markup. Every card is the same anatomy:
 * sky background with the one allowed gradient (a lift to #EEF8FE from the top left), a clay card inset
 * 80px, content inside 88px padding, the wordmark footer, and the seeded emoji scatter on top.
 * Layout adapts to the two canvases (1200x1200 and 1600x900) from the content box size alone.
 */

/** The only gradient in the system: --sky-100 lifting to near white at the top left. */
export const LIFT = `radial-gradient(120% 120% at 0% 0%, #EEF8FE 0%, ${SKY[100]} 58%, ${SKY[100]} 100%)`;
const FOOTER_H = 40;

/** Clear space kept between the content and the footer row so copy never kisses the wordmarks. */
const BREATH = 40;

export type Ctx = { w: number; h: number; contentW: number; contentH: number; wide: boolean; sprites: Sprites; clay: ClaySet };

export function makeCtx(w: number, h: number, sprites: Sprites, clay: ClaySet): Ctx {
  const inset = ARTBOARD_INSET + CARD_PADDING;
  return { w, h, contentW: w - 2 * inset, contentH: h - 2 * inset - FOOTER_H - BREATH, wide: w / h > 1.3, sprites, clay };
}

/** Card background per template: white for structured layouts, --sky-50 for the two single-subject cards. */
export const CARD_BG: Record<CardSpec["template"], ClayBg> = {
  announcement: "white",
  pair: "sky50",
  leaderboard: "white",
  open: "white",
  claimed: "white",
  bignumber: "sky50",
};

export function Frame({ ctx, placements, children }: { ctx: Ctx; placements: Placement[]; children: ReactNode }) {
  const { w, h, sprites, clay } = ctx;
  const cardW = w - 2 * ARTBOARD_INSET;
  const cardH = h - 2 * ARTBOARD_INSET;
  return (
    <div style={{ width: w, height: h, display: "flex", position: "relative", background: LIFT, fontFamily: FONT.heading, overflow: "hidden" }}>
      {/* The clay surface is a pre-rendered PNG (see clay.tsx); the content sits in a transparent box on top of it. */}
      <ClayCard clay={clay} x={ARTBOARD_INSET} y={ARTBOARD_INSET} w={cardW} h={cardH} />
      <div
        style={{
          position: "absolute",
          left: ARTBOARD_INSET,
          top: ARTBOARD_INSET,
          width: cardW,
          height: cardH,
          padding: CARD_PADDING,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", paddingBottom: BREATH }}>{children}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, height: FOOTER_H }}>
          <div style={{ fontFamily: FONT.heading, fontWeight: 600, fontSize: 40, color: SKY[600], lineHeight: 1 }}>moji</div>
          <div style={{ fontFamily: FONT.body, fontWeight: 800, fontSize: 24, color: INK_SOFT, lineHeight: 1 }}>moji.wtf</div>
        </div>
      </div>
      {placements.map((p, i) => (
        <Emoji key={i} sprites={sprites} emoji={p.emoji} size={p.size} rotate={p.rotate} shadow={p.hero ? SHADOW.large : p.size >= 80 ? SHADOW.medium : SHADOW.small} style={{ position: "absolute", left: p.x, top: p.y }} />
      ))}
    </div>
  );
}

function Header({ text, ctx }: { text: string; ctx: Ctx }) {
  return <Rich text={text} sprites={ctx.sprites} size={fitLine(text, [76, 68, 60, 52], ctx.contentW)} color={INK} lineHeight={1} />;
}

/* 1. announcement: headline (max 8 words) + optional subline, centred. Long copy wraps to 3 lines then shrinks. */
export function Announcement({ ctx, f }: { ctx: Ctx; f: Fields["announcement"] }) {
  const maxW = ctx.contentW - 80;
  const subline = f.subline.trim();
  const sublineSize = subline ? fitLine(subline, [44, 40, 36, 32], maxW, NUNITO_800) : 0;
  const reserved = subline ? sublineSize * 1.3 + 36 : 0;
  const { size } = fitBlock(f.headline, [132, 120, 108, 96, 84, 72, 60], maxW, ctx.contentH - reserved, 1.02, 3);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, padding: "0 40px" }}>
      <Rich text={f.headline} sprites={ctx.sprites} size={size} color={INK} lineHeight={1.02} align="center" wrap style={{ width: maxW, justifyContent: "center" }} />
      {subline ? <Rich text={subline} sprites={ctx.sprites} size={sublineSize} color={INK_SOFT} font={FONT.body} lineHeight={1.2} align="center" style={{ width: maxW, justifyContent: "center" }} /> : null}
    </div>
  );
}

/* 2. pair: pill label, hero combo, "🍎 / $AAPL" on one line. */
export function Pair({ ctx, f }: { ctx: Ctx; f: Fields["pair"] }) {
  const label = f.label.trim().toUpperCase();
  const pillH = label ? 28 * 1.2 + 40 : 0;
  const pairText = `${f.combo.trim()} / ${dollar(f.ticker) || "$"}`;
  const pairSize = fitLine(pairText, [92, 84, 76, 68, 60, 52, 44], ctx.contentW);
  const hero = Math.max(160, Math.min(300, ctx.contentH - (label ? pillH + 44 : 0) - pairSize * 1.08 - 44));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
      {label ? (
        <ClayBox clay={ctx.clay} kind="pill" w={Math.ceil(lineWidth(label, 28, NUNITO_800, 0.16)) + 80} h={pillH}>
          <div style={{ display: "flex", fontFamily: FONT.body, fontWeight: 800, fontSize: 28, lineHeight: 1.2, letterSpacing: `${0.16 * 28}px`, color: MINT, whiteSpace: "nowrap" }}>{label}</div>
        </ClayBox>
      ) : null}
      <ComboEmoji sprites={ctx.sprites} combo={f.combo} width={ctx.contentW} size={hero} shadow={SHADOW.hero} />
      <Rich text={pairText} sprites={ctx.sprites} size={pairSize} color={INK} lineHeight={1} />
    </div>
  );
}

/* 3. leaderboard: header + three rows of {emoji, pair, figure} separated by thick soft rules. */
export function Leaderboard({ ctx, f }: { ctx: Ctx; f: Fields["leaderboard"] }) {
  const rows = f.rows.slice(0, 3);
  const emojiSize = ctx.wide ? 84 : 96;
  const cell = 140;
  const availH = ctx.contentH - 76;
  const rowPad = Math.max(12, Math.min(36, Math.floor((availH - rows.length * emojiSize - (rows.length - 1) * 10) / (rows.length * 2))));
  const figureSize = Math.min(...rows.map((r) => fitLine(r.figure, [60, 52, 44], ctx.contentW * 0.4)));
  const figureW = Math.max(...rows.map((r) => (r.figure ? fitLine(r.figure, [figureSize], ctx.contentW) : 0)));
  const figureCol = Math.max(...rows.map((r) => Math.ceil(r.figure.length * figureSize * 0.62)));
  const pairMax = ctx.contentW - cell - 32 - figureCol - 32;
  const pairSize = Math.min(figureW || 60, ...rows.map((r) => fitLine(r.pair, [60, 52, 44, 36], pairMax)));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Header text={f.title} ctx={ctx} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column" }}>
            {i > 0 ? <div style={{ height: 10, borderRadius: RADIUS.sm, background: SKY[100] }} /> : null}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 32, padding: `${rowPad}px 0` }}>
              <ComboEmoji sprites={ctx.sprites} combo={r.emoji} width={cell} size={emojiSize} shadow={SHADOW.row} overlap={8} />
              <div style={{ flex: 1, display: "flex" }}>
                <Rich text={r.pair} sprites={ctx.sprites} size={pairSize} color={INK} lineHeight={1.1} />
              </div>
              <Rich text={r.figure} sprites={ctx.sprites} size={figureSize} color={MINT} lineHeight={1.1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 4. open: header + 6 to 8 emoji on clay circles, evenly spaced, with an optional ticker under each. */
export function Open({ ctx, f }: { ctx: Ctx; f: Fields["open"] }) {
  const items = f.items.filter((i) => i.emoji.trim()).slice(0, 8);
  const n = Math.max(1, items.length);
  const gap = n >= 8 ? 14 : 20;
  const circle = Math.min(132, Math.floor((ctx.contentW - (n - 1) * gap) / n));
  const emojiSize = Math.round(circle * 0.545);
  const anyTicker = items.some((i) => i.ticker.trim());
  const tickerSize = anyTicker ? Math.min(...items.filter((i) => i.ticker.trim()).map((i) => fitLine(i.ticker, [32, 28, 24, 20], circle + gap - 12))) : 0;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Header text={f.title} ctx={ctx} />
      <div style={{ flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: n > 1 ? "space-between" : "center", gap }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: circle }}>
            <ClayBox clay={ctx.clay} kind="circle" w={circle} h={circle}>
              <ComboEmoji sprites={ctx.sprites} combo={it.emoji} width={Math.round(circle * 0.8)} size={emojiSize} overlap={6} />
            </ClayBox>
            {anyTicker ? <Rich text={it.ticker || " "} sprites={ctx.sprites} size={tickerSize} color={INK} lineHeight={1} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 5. claimed: header + a grid of 8 to 12 combo tiles + the count. */
export function Claimed({ ctx, f }: { ctx: Ctx; f: Fields["claimed"] }) {
  const tiles = f.tiles.filter((t) => t.emoji.trim()).slice(0, 12);
  const n = Math.max(1, tiles.length);
  const cols = ctx.wide ? (n <= 8 ? n : n <= 10 ? 5 : 6) : n % 5 === 0 ? 5 : n % 4 === 0 ? 4 : n <= 9 ? 5 : 4;
  const gap = 24;
  const tileW = Math.floor((ctx.contentW - (cols - 1) * gap) / cols);
  const rowsN = Math.ceil(n / cols);
  const tileH = 22 + 52 + 10 + 22 * 1.2 + 22;
  const availH = ctx.contentH - 76;
  const countSize = fitLine(f.count, ctx.wide ? [84, 72, 60] : [96, 84, 72, 60], ctx.contentW);
  const countGap = ctx.wide ? 36 : 48;
  // Leave a little air above and below the grid + count block so the header never touches the tiles.
  const scale = Math.min(1, (availH - 32 - countSize - countGap) / (rowsN * tileH + (rowsN - 1) * gap));
  const emojiSize = Math.round(52 * scale);
  const tickerSize = Math.max(16, Math.round(22 * scale));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Header text={f.title} ctx={ctx} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: countGap }}>
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap }}>
          {tiles.map((t, i) => (
            <ClayBox key={i} clay={ctx.clay} kind="tile" w={tileW} h={Math.round(tileH * scale)}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <ComboEmoji sprites={ctx.sprites} combo={t.emoji} width={tileW - 24} size={emojiSize} overlap={4} />
                <Rich text={t.ticker || " "} sprites={ctx.sprites} size={Math.min(tickerSize, fitLine(t.ticker, [tickerSize], tileW - 20, NUNITO_800))} color={INK_SOFT} font={FONT.body} lineHeight={1.2} />
              </div>
            </ClayBox>
          ))}
        </div>
        <Rich text={f.count} sprites={ctx.sprites} size={countSize} color={INK} lineHeight={1} />
      </div>
    </div>
  );
}

/* 6. bignumber: pair above, one very large figure, a short label. */
export function BigNumber({ ctx, f }: { ctx: Ctx; f: Fields["bignumber"] }) {
  const pairSize = fitLine(f.pair, [64, 56, 48, 40], ctx.contentW);
  const label = f.label.trim();
  const labelSize = label ? fitLine(label, [44, 40, 36], ctx.contentW, NUNITO_800) : 0;
  const maxFigureH = ctx.contentH - pairSize - (label ? labelSize * 1.2 + 24 : 0) - 24;
  const figureSize = Math.min(fitLine(f.figure, [300, 280, 260, 240, 220, 200, 180, 160, 140, 120], ctx.contentW, FREDOKA_600, -0.02), Math.floor(maxFigureH));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <Rich text={f.pair} sprites={ctx.sprites} size={pairSize} color={SKY[600]} lineHeight={1} />
      <Rich text={f.figure} sprites={ctx.sprites} size={figureSize} color={INK} lineHeight={1} letterSpacingEm={-0.02} />
      {label ? <Rich text={label} sprites={ctx.sprites} size={labelSize} color={INK_SOFT} font={FONT.body} lineHeight={1.2} /> : null}
    </div>
  );
}

/** Every emoji grapheme a spec needs (plain, and those drawn with a shadow), resolved before the synchronous render. */
export function emojiNeeded(spec: CardSpec): { plain: string[]; shadowed: string[] } {
  const texts: string[] = [];
  const combos: string[] = [];
  const shadowed: string[] = [];
  switch (spec.template) {
    case "announcement": {
      const f = spec.fields as Fields["announcement"];
      texts.push(f.headline, f.subline);
      break;
    }
    case "pair": {
      const f = spec.fields as Fields["pair"];
      shadowed.push(f.combo);
      texts.push(f.label);
      break;
    }
    case "leaderboard": {
      const f = spec.fields as Fields["leaderboard"];
      for (const r of f.rows) {
        shadowed.push(r.emoji);
        texts.push(r.pair, r.figure, f.title);
      }
      break;
    }
    case "open": {
      const f = spec.fields as Fields["open"];
      texts.push(f.title);
      for (const i of f.items) {
        combos.push(i.emoji);
        texts.push(i.ticker);
      }
      break;
    }
    case "claimed": {
      const f = spec.fields as Fields["claimed"];
      texts.push(f.title, f.count);
      for (const t of f.tiles) {
        combos.push(t.emoji);
        texts.push(t.ticker);
      }
      break;
    }
    case "bignumber": {
      const f = spec.fields as Fields["bignumber"];
      texts.push(f.pair, f.figure, f.label);
      break;
    }
  }
  // Combos are drawn grapheme by grapheme; text fields are tokenised the same way in Rich.
  const g = (list: string[]) => list.flatMap((c) => graphemes(c)).filter((x) => x.trim());
  return { plain: [...g(combos), ...g(texts)], shadowed: g(shadowed) };
}

export function renderTemplate(spec: CardSpec, ctx: Ctx): ReactNode {
  switch (spec.template) {
    case "announcement":
      return <Announcement ctx={ctx} f={spec.fields as Fields["announcement"]} />;
    case "pair":
      return <Pair ctx={ctx} f={spec.fields as Fields["pair"]} />;
    case "leaderboard":
      return <Leaderboard ctx={ctx} f={spec.fields as Fields["leaderboard"]} />;
    case "open":
      return <Open ctx={ctx} f={spec.fields as Fields["open"]} />;
    case "claimed":
      return <Claimed ctx={ctx} f={spec.fields as Fields["claimed"]} />;
    case "bignumber":
      return <BigNumber ctx={ctx} f={spec.fields as Fields["bignumber"]} />;
  }
}
