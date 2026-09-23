import "server-only";
import type { ReactNode } from "react";
import { FONT, INK, INK_SOFT, MINT, RADIUS, SKY } from "@/config/design";
import { graphemes } from "@/lib/emoji";
import { ARTBOARD_INSET, CARD_PADDING, type Placement } from "./scatter";
import { Emoji, SHADOW, type Sprites } from "./emoji";
import { ClayBox, ClayCard, type ClayBg, type ClaySet } from "./clay";
import type { Pictures } from "./picture";
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
/** Footer row: the wordmark image (public/moji.png, 689x347) at this height on the left, "moji.wtf" on the right. */
const FOOTER_H = 56;
const WORDMARK_W = Math.round((FOOTER_H * 689) / 347);

/** Clear space kept between the content and the footer row so copy never kisses the wordmarks. */
const BREATH = 40;

export type Ctx = { w: number; h: number; contentW: number; contentH: number; wide: boolean; sprites: Sprites; pictures: Pictures; clay: ClaySet; wordmark: string };

export function makeCtx(w: number, h: number, sprites: Sprites, pictures: Pictures, clay: ClaySet, wordmark: string): Ctx {
  const inset = ARTBOARD_INSET + CARD_PADDING;
  return { w, h, contentW: w - 2 * inset, contentH: h - 2 * inset - FOOTER_H - BREATH, wide: w / h > 1.3, sprites, pictures, clay, wordmark };
}

/** Card background per template: white for structured layouts, --sky-50 for the two single-subject cards. */
export const CARD_BG: Record<CardSpec["template"], ClayBg> = {
  announcement: "white",
  pair: "sky50",
  leaderboard: "white",
  open: "white",
  claimed: "white",
  bignumber: "sky50",
  token: "white",
  airdrop: "sky50",
  airdrops: "white",
};

export function Frame({ ctx, placements, children }: { ctx: Ctx; placements: Placement[]; children: ReactNode }) {
  const { w, h, sprites, clay, wordmark } = ctx;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wordmark} width={WORDMARK_W} height={FOOTER_H} alt="moji" style={{ width: WORDMARK_W, height: FOOTER_H }} />
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
  // "🍎 / $AAPL" for a moji; a meme reads "$MUMU / MUSEBOOK" (its own ticker carries the dollar sign).
  const pairText = f.combo.trim().startsWith("$") ? `${f.combo.trim()} / ${f.ticker.trim().replace(/^\$/, "").toUpperCase()}` : `${f.combo.trim()} / ${dollar(f.ticker) || "$"}`;
  const pairSize = fitLine(pairText, [92, 84, 76, 68, 60, 52, 44], ctx.contentW);
  const hero = Math.max(160, Math.min(300, ctx.contentH - (label ? pillH + 44 : 0) - pairSize * 1.08 - 44));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
      {label ? (
        <ClayBox clay={ctx.clay} kind="pill" w={Math.ceil(lineWidth(label, 28, NUNITO_800, 0.16)) + 80} h={pillH}>
          <div style={{ display: "flex", fontFamily: FONT.body, fontWeight: 800, fontSize: 28, lineHeight: 1.2, letterSpacing: `${0.16 * 28}px`, color: MINT, whiteSpace: "nowrap" }}>{label}</div>
        </ClayBox>
      ) : null}
      <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={f.combo} img={f.img} width={ctx.contentW} size={hero} shadow={SHADOW.hero} />
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
              <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={r.emoji} img={r.img} width={cell} size={emojiSize} shadow={SHADOW.row} overlap={8} />
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
              <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={it.emoji} img={it.img} width={Math.round(circle * 0.8)} size={emojiSize} overlap={6} />
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
                <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={t.emoji} img={t.img} width={tileW - 24} size={emojiSize} overlap={4} />
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

/* 7. token: one pair's stats. Hero combo + "$MSFT" + creator line on top, 2 to 4 clay stat tiles below. */
export function Token({ ctx, f }: { ctx: Ctx; f: Fields["token"] }) {
  const stats = f.stats.filter((s) => s.label.trim() || s.value.trim()).slice(0, 4);
  const n = Math.max(1, stats.length);
  const hero = ctx.wide ? 140 : 168;
  // The hero already shows the combo, so the text is just the ticker.
  const pairText = dollar(f.ticker) || "$";
  const textW = ctx.contentW - hero - 40;
  const pairSize = fitLine(pairText, [92, 84, 76, 68, 60, 52], textW);
  const creator = f.creator.trim();
  const creatorSize = creator ? fitLine(creator, [32, 28, 24], textW, NUNITO_800) : 0;
  const gap = 24;
  const cols = ctx.wide || n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const tileW = Math.floor((ctx.contentW - (cols - 1) * gap) / cols);
  const headH = Math.max(hero, pairSize + (creator ? creatorSize * 1.3 + 12 : 0));
  const tileH = Math.min(172, Math.floor((ctx.contentH - headH - 48 - (rows - 1) * gap) / rows));
  const labelSize = 22;
  const valueSize = Math.min(...stats.map((st) => fitLine(st.value, [60, 52, 44, 36], tileW - 48)), Math.floor((tileH - labelSize * 1.2 - 40) / 1.1));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 40 }}>
        <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={f.combo} img={f.img} width={hero} size={hero} shadow={SHADOW.row} overlap={12} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Rich text={pairText} sprites={ctx.sprites} size={pairSize} color={INK} lineHeight={1} />
          {creator ? <Rich text={creator} sprites={ctx.sprites} size={creatorSize} color={INK_SOFT} font={FONT.body} lineHeight={1.3} /> : null}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap }}>
        {stats.map((st, i) => (
          <ClayBox key={i} clay={ctx.clay} kind="stat" w={tileW} h={tileH}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", fontFamily: FONT.body, fontWeight: 800, fontSize: labelSize, lineHeight: 1.2, letterSpacing: `${0.1 * labelSize}px`, color: INK_SOFT }}>{st.label.toUpperCase()}</div>
              <Rich text={st.value} sprites={ctx.sprites} size={valueSize} color={INK} lineHeight={1.1} />
            </div>
          </ClayBox>
        ))}
      </div>
    </div>
  );
}

/* 8. airdrop: a creator's drop to holders. Hero combo, pill, the USD figure and a one line summary, then stat tiles. */
export function Airdrop({ ctx, f }: { ctx: Ctx; f: Fields["airdrop"] }) {
  const stats = f.stats.filter((s) => s.label.trim() || s.value.trim()).slice(0, 4);
  const n = Math.max(1, stats.length);
  const hero = ctx.wide ? 140 : 168;
  const textW = ctx.contentW - hero - 40;
  const label = f.label.trim().toUpperCase();
  const pillH = label ? 24 * 1.2 + 32 : 0;
  const figureSize = fitLine(f.figure, ctx.wide ? [108, 96, 84, 72] : [132, 120, 108, 96, 84], textW);
  const sub = f.sub.trim();
  const subSize = sub ? fitLine(sub, [32, 28, 24, 20], textW, NUNITO_800) : 0;
  const headH = Math.max(hero, (label ? pillH + 14 : 0) + figureSize + (sub ? subSize * 1.3 + 12 : 0));
  const gap = 24;
  const cols = ctx.wide || n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const tileW = Math.floor((ctx.contentW - (cols - 1) * gap) / cols);
  const tileH = Math.max(120, Math.min(172, Math.floor((ctx.contentH - headH - 40 - (rows - 1) * gap) / rows)));
  const labelSize = 22;
  const valueSize = Math.min(...stats.map((st) => fitLine(st.value, [60, 52, 44, 36], tileW - 48)), Math.floor((tileH - labelSize * 1.2 - 40) / 1.1));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 40 }}>
        <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={f.combo} img={f.img} width={hero} size={hero} shadow={SHADOW.row} overlap={12} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          {label ? (
            <ClayBox clay={ctx.clay} kind="pill" w={Math.ceil(lineWidth(label, 24, NUNITO_800, 0.16)) + 64} h={pillH}>
              <Rich text={label} sprites={ctx.sprites} size={24} color={MINT} font={FONT.body} lineHeight={1.2} letterSpacingEm={0.16} />
            </ClayBox>
          ) : null}
          <Rich text={f.figure} sprites={ctx.sprites} size={figureSize} color={INK} lineHeight={1} letterSpacingEm={-0.01} />
          {sub ? <Rich text={sub} sprites={ctx.sprites} size={subSize} color={INK_SOFT} font={FONT.body} lineHeight={1.3} /> : null}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap }}>
        {stats.map((st, i) => (
          <ClayBox key={i} clay={ctx.clay} kind="stat" w={tileW} h={tileH}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", fontFamily: FONT.body, fontWeight: 800, fontSize: labelSize, lineHeight: 1.2, letterSpacing: `${0.1 * labelSize}px`, color: INK_SOFT }}>{st.label.toUpperCase()}</div>
              <Rich text={st.value} sprites={ctx.sprites} size={valueSize} color={INK} lineHeight={1.1} />
            </div>
          </ClayBox>
        ))}
      </div>
    </div>
  );
}

/* 9. airdrops: the week's airdrops as tiles (combo, ticker, USD paid, holders paid) with a total line. */
export function Airdrops({ ctx, f }: { ctx: Ctx; f: Fields["airdrops"] }) {
  const items = f.items.filter((i) => i.emoji.trim() || i.ticker.trim()).slice(0, 8);
  const n = Math.max(1, items.length);
  const cols = ctx.wide ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const gap = 24;
  const tileW = Math.floor((ctx.contentW - (cols - 1) * gap) / cols);
  const rowsN = Math.ceil(n / cols);
  const tileH = 216;
  const availH = ctx.contentH - 76;
  const countSize = fitLine(f.count, ctx.wide ? [72, 60, 52, 44] : [84, 72, 60, 52], ctx.contentW);
  const countGap = ctx.wide ? 36 : 48;
  const scale = Math.min(1, (availH - 32 - countSize - countGap) / (rowsN * tileH + (rowsN - 1) * gap));
  const emojiSize = Math.round(52 * scale);
  const tickerSize = Math.max(16, Math.round(22 * scale));
  const figureSize = Math.max(24, Math.round(40 * scale));
  const holdersSize = Math.max(14, Math.round(20 * scale));
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Header text={f.title} ctx={ctx} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: countGap }}>
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap }}>
          {items.map((it, i) => (
            <ClayBox key={i} clay={ctx.clay} kind="drop" w={tileW} h={Math.round(tileH * scale)}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(8 * scale) }}>
                <ComboEmoji sprites={ctx.sprites} pictures={ctx.pictures} combo={it.emoji} img={it.img} width={tileW - 24} size={emojiSize} overlap={4} />
                <Rich text={it.ticker || " "} sprites={ctx.sprites} size={Math.min(tickerSize, fitLine(it.ticker, [tickerSize], tileW - 20, NUNITO_800))} color={INK_SOFT} font={FONT.body} lineHeight={1.2} />
                <Rich text={it.figure || " "} sprites={ctx.sprites} size={Math.min(figureSize, fitLine(it.figure, [figureSize], tileW - 20))} color={INK} lineHeight={1.1} />
                <Rich text={it.holders || " "} sprites={ctx.sprites} size={Math.min(holdersSize, fitLine(it.holders, [holdersSize], tileW - 20, NUNITO_800))} color={INK_SOFT} font={FONT.body} lineHeight={1.2} />
              </div>
            </ClayBox>
          ))}
        </div>
        <Rich text={f.count} sprites={ctx.sprites} size={countSize} color={INK} lineHeight={1} />
      </div>
    </div>
  );
}

/** Every emoji grapheme a spec needs (plain, and those drawn with a shadow), resolved before the synchronous render. */
export function emojiNeeded(spec: CardSpec): { plain: string[]; shadowed: string[]; pictures: string[] } {
  const texts: string[] = [];
  const combos: string[] = [];
  const shadowed: string[] = [];
  const pictures: string[] = [];
  const pic = (u?: string) => u && pictures.push(u);
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
      pic(f.img);
      break;
    }
    case "leaderboard": {
      const f = spec.fields as Fields["leaderboard"];
      for (const r of f.rows) {
        shadowed.push(r.emoji);
        texts.push(r.pair, r.figure, f.title);
        pic(r.img);
      }
      break;
    }
    case "open": {
      const f = spec.fields as Fields["open"];
      texts.push(f.title);
      for (const i of f.items) {
        combos.push(i.emoji);
        texts.push(i.ticker);
        pic(i.img);
      }
      break;
    }
    case "claimed": {
      const f = spec.fields as Fields["claimed"];
      texts.push(f.title, f.count);
      for (const t of f.tiles) {
        combos.push(t.emoji);
        texts.push(t.ticker);
        pic(t.img);
      }
      break;
    }
    case "bignumber": {
      const f = spec.fields as Fields["bignumber"];
      texts.push(f.pair, f.figure, f.label);
      break;
    }
    case "token": {
      const f = spec.fields as Fields["token"];
      shadowed.push(f.combo);
      texts.push(f.combo, f.ticker, f.creator, ...f.stats.flatMap((st) => [st.label, st.value]));
      pic(f.img);
      break;
    }
    case "airdrop": {
      const f = spec.fields as Fields["airdrop"];
      shadowed.push(f.combo);
      texts.push(f.combo, f.ticker, f.label, f.figure, f.sub, ...f.stats.flatMap((st) => [st.label, st.value]));
      pic(f.img);
      break;
    }
    case "airdrops": {
      const f = spec.fields as Fields["airdrops"];
      texts.push(f.title, f.count);
      for (const it of f.items) {
        combos.push(it.emoji);
        texts.push(it.ticker, it.figure, it.holders);
        pic(it.img);
      }
      break;
    }
  }
  // Combos are drawn grapheme by grapheme; text fields are tokenised the same way in Rich.
  const g = (list: string[]) => list.flatMap((c) => graphemes(c)).filter((x) => x.trim());
  return { plain: [...g(combos), ...g(texts)], shadowed: g(shadowed), pictures };
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
    case "token":
      return <Token ctx={ctx} f={spec.fields as Fields["token"]} />;
    case "airdrop":
      return <Airdrop ctx={ctx} f={spec.fields as Fields["airdrop"]} />;
    case "airdrops":
      return <Airdrops ctx={ctx} f={spec.fields as Fields["airdrops"]} />;
  }
}
