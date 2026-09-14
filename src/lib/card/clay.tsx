import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";
import { CLAY, CLAY_SM, RADIUS, SKY } from "@/config/design";

/**
 * Clay surfaces (rounded shapes carrying the --clay / --clay-sm shadows) as PNG sprites.
 *
 * satori turns every box-shadow layer into a full canvas blur (its shadow masks span the whole viewport), so
 * one clay card costs ~2.5s and a small tile ~0.5s. The surfaces are rendered once from the tokens into
 * src/assets/clay (`npm run cards:assets`) and drawn as images:
 *   - card:   one image per canvas and background
 *   - circle: one image, scaled uniformly to any diameter
 *   - tile and pill: three slices (left cap, stretchable middle, right cap), exact for any width because a
 *     box-shadow is translation invariant along a straight edge
 * A missing asset is rendered on the fly and cached in memory, so a new size still works, just slower once.
 */
export const CLAY_BG = { white: "#FFFFFF", sky50: SKY[50] } as const;
export type ClayBg = keyof typeof CLAY_BG;

const ASSET_DIR = path.join(process.cwd(), "src", "assets", "clay");

/** Shadow spill kept around each shape so the blur is never clipped. */
export const CARD_SPILL = 48;
export const SMALL_SPILL = 24;

/** Canonical geometry of the small shapes. Drawn sizes scale from these. */
export const SMALL = {
  circle: { w: 132, h: 132, r: 999, bg: "sky50" as ClayBg },
  tile: { w: 400, h: 128, r: 24, bg: "sky50" as ClayBg },
  stat: { w: 400, h: 172, r: 24, bg: "sky50" as ClayBg },
  pill: { w: 400, h: 74, r: 999, bg: "white" as ClayBg },
} as const;
export type SmallKind = keyof typeof SMALL;
/** Width of the end caps of a sliced shape: spill + radius + a little straight edge. */
const CAP = { tile: SMALL_SPILL + SMALL.tile.r + 8, stat: SMALL_SPILL + SMALL.stat.r + 8, pill: SMALL_SPILL + SMALL.pill.h / 2 + 8 } as const;
const MID = 16;

type Asset =
  | { kind: "card"; w: number; h: number; bg: ClayBg }
  | { kind: "circle" }
  | { kind: "tile" | "stat" | "pill"; slice: "left" | "mid" | "right" };

export function assetName(a: Asset): string {
  if (a.kind === "card") return `card-${a.w}x${a.h}-${a.bg}.png`;
  if (a.kind === "circle") return "circle.png";
  return `${a.kind}-${a.slice}.png`;
}

/** Every asset the renderer expects, for the generator script. */
export function allAssets(cardSizes: { w: number; h: number }[]): Asset[] {
  const out: Asset[] = [];
  for (const s of cardSizes) for (const bg of Object.keys(CLAY_BG) as ClayBg[]) out.push({ kind: "card", w: s.w, h: s.h, bg });
  out.push({ kind: "circle" });
  for (const kind of ["tile", "stat", "pill"] as const) for (const slice of ["left", "mid", "right"] as const) out.push({ kind, slice });
  return out;
}

/** Render one asset with satori: a transparent canvas showing the shape (or a slice of it) with its shadow. */
export async function renderAsset(a: Asset): Promise<Buffer> {
  let canvasW: number, canvasH: number, left: number, top: number, w: number, h: number, r: number, bg: string, shadow: string;
  if (a.kind === "card") {
    w = a.w; h = a.h; r = RADIUS.clay; bg = CLAY_BG[a.bg]; shadow = CLAY;
    canvasW = w + 2 * CARD_SPILL; canvasH = h + 2 * CARD_SPILL; left = CARD_SPILL; top = CARD_SPILL;
  } else {
    const g = SMALL[a.kind];
    w = g.w; h = g.h; r = g.r; bg = CLAY_BG[g.bg]; shadow = CLAY_SM;
    const fullW = w + 2 * SMALL_SPILL;
    canvasH = h + 2 * SMALL_SPILL; top = SMALL_SPILL;
    if (a.kind === "circle") { canvasW = fullW; left = SMALL_SPILL; }
    else if (a.slice === "left") { canvasW = CAP[a.kind]; left = SMALL_SPILL; }
    else if (a.slice === "right") { canvasW = CAP[a.kind]; left = SMALL_SPILL - (fullW - CAP[a.kind]); }
    else { canvasW = MID; left = SMALL_SPILL - Math.round(fullW / 2); }
  }
  const res = new ImageResponse(
    (
      <div style={{ width: canvasW, height: canvasH, display: "flex", background: "transparent", overflow: "hidden" }}>
        <div style={{ position: "absolute", left, top, width: w, height: h, borderRadius: r, background: bg, boxShadow: shadow, display: "flex" }} />
      </div>
    ),
    { width: canvasW, height: canvasH },
  );
  return Buffer.from(await res.arrayBuffer());
}

const cache = new Map<string, Promise<string>>();
/** PNG data URL of an asset: bundled file first, else rendered live once. */
function asset(a: Asset): Promise<string> {
  const name = assetName(a);
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      let buf: Buffer;
      try {
        buf = await readFile(path.join(ASSET_DIR, name));
      } catch {
        console.warn(`clay asset ${name} missing, rendering live (run npm run cards:assets)`);
        buf = await renderAsset(a);
      }
      return `data:image/png;base64,${buf.toString("base64")}`;
    })();
    cache.set(name, p);
    p.catch(() => cache.delete(name));
  }
  return p;
}

type Slices = [string, string, string];
export type ClaySet = { card: string; circle: string; tile: Slices; stat: Slices; pill: Slices };
/** Everything a card render needs, loaded in parallel. */
export async function loadClay(cardW: number, cardH: number, bg: ClayBg): Promise<ClaySet> {
  const [card, circle, ...slices] = await Promise.all([
    asset({ kind: "card", w: cardW, h: cardH, bg }),
    asset({ kind: "circle" }),
    ...(["tile", "stat", "pill"] as const).flatMap((kind) => (["left", "mid", "right"] as const).map((slice) => asset({ kind, slice }))),
  ]);
  const take = (i: number): Slices => [slices[i], slices[i + 1], slices[i + 2]];
  return { card, circle, tile: take(0), stat: take(3), pill: take(6) };
}

const img = (src: string, x: number, y: number, w: number, h: number, key?: string | number) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img key={key} src={src} width={w} height={h} alt="" style={{ position: "absolute", left: x, top: y, width: w, height: h }} />
);

/** The clay card surface, positioned so the shape lands at (x, y). */
export function ClayCard({ clay, x, y, w, h }: { clay: ClaySet; x: number; y: number; w: number; h: number }) {
  return img(clay.card, x - CARD_SPILL, y - CARD_SPILL, w + 2 * CARD_SPILL, h + 2 * CARD_SPILL);
}

/**
 * A small clay shape of w x h with `children` centred on it. Circles scale uniformly; tiles and pills are
 * sliced so any width is exact. Height scales the shadow slightly, which is invisible at these sizes.
 */
export function ClayBox({ clay, kind, w, h, children, style }: { clay: ClaySet; kind: SmallKind; w: number; h: number; children?: ReactNode; style?: React.CSSProperties }) {
  const g = SMALL[kind];
  const k = h / g.h;
  const spill = SMALL_SPILL * k;
  let surface: ReactNode;
  if (kind === "circle") {
    surface = img(clay.circle, -spill, -spill, w + 2 * spill, h + 2 * spill);
  } else {
    // Whole pixel positions with no overlap: a fractional or overlapping join double composites the shadow alpha and shows as a seam.
    const [l, m, r] = clay[kind];
    const cap = Math.round(CAP[kind] * k);
    const total = Math.round(w + 2 * spill);
    const H = Math.round(h + 2 * spill);
    const mid = Math.max(0, total - 2 * cap);
    surface = (
      <div style={{ position: "absolute", left: -Math.round(spill), top: -Math.round(spill), width: total, height: H, display: "flex" }}>
        {img(l, 0, 0, cap, H, "l")}
        {mid > 0 ? img(m, cap, 0, mid, H, "m") : null}
        {img(r, cap + mid, 0, cap, H, "r")}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...style }}>
      {surface}
      {children}
    </div>
  );
}
