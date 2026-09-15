/**
 * The emoji scatter shared by every card: 6 to 10 emoji around the outer edge of the artboard, in the
 * 80px band outside the clay card or bleeding over its corners. Fully determined by (seed, w, h) so the
 * preview and the download are the same image and a refresh only reshuffles when the seed changes.
 *
 * `seed` drives the layout (which slots, positions, sizes, rotations); `mix` drives which emoji fill them and
 * defaults to the seed, so "swap emoji" can change the faces while every position stays put.
 *
 * Hard rules (from the design handoff):
 *  - 🍎 is always present, always the largest, and always top left or bottom right
 *  - sizes 40 to 120px, rotation between -18 and 18 degrees
 *  - nothing intrudes into the card's content box (the text zone: card inset 80 + padding 88), so copy
 *    can change freely without the layout breaking, and nothing overlaps the footer wordmarks
 *  - loose and hand placed looking: slot positions are jittered and one or two slots are skipped
 */
export const APPLE = "🍎";

/** Decorative pool. Sprites for all of these are bundled in src/assets/emoji (`npm run cards:assets`). */
export const SCATTER_POOL = [
  "🪟", "🍕", "☕", "🪙", "🔮", "📦", "🩹", "🧇", "🎢", "🏠", "💊", "☁️", "💾", "✈️", "🔍", "💻", "⚡", "🚀", "🌙", "🐕",
  "🦖", "🧊", "🪝", "🫧", "🛼", "🧲", "🔥", "💎", "🧠", "🎯", "🌈", "🍀", "📈", "🛸", "🍒", "🌊", "🐸", "🦄", "👑", "🎲",
  "🍩", "🎈", "🐳", "🦊", "🌵", "🍄", "🧬", "🎸", "🍔", "🎮", "🛹", "🍿", "🎧", "🏀", "🍋", "🐙", "🦋", "🪐", "🧸", "📱",
] as const;

export const ARTBOARD_INSET = 80;
export const CARD_PADDING = 88;
/** Distance from the artboard edge to the text zone. */
export const CONTENT_INSET = ARTBOARD_INSET + CARD_PADDING;

export type Placement = { emoji: string; x: number; y: number; size: number; rotate: number; hero: boolean };

type Range = [number, number];
type Slot = { name: string; x: Range; y: Range; size: Range };

/* Seeded PRNG: FNV-1a hash of the seed feeding mulberry32. Same seed, same sequence, on server and client. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: () => number, [a, b]: Range) => a + (b - a) * rng();

/** Slot ranges observed in the reference artboards (1200x1200), expressed relative to the canvas edges. */
function slots(w: number, h: number): { corners: { tl: Slot; br: Slot }; rest: Slot[] } {
  const wide = w / h > 1.3;
  const tl: Slot = { name: "tl", x: [14, 22], y: [16, 26], size: [80, 96] };
  const br: Slot = { name: "br", x: [w - 138, w - 130], y: [h - 140, h - 132], size: [86, 92] };
  const rest: Slot[] = [
    { name: "t", x: [w * 0.33, w * 0.5], y: [2, 8], size: [54, 62] },
    { name: "tr", x: [w - 148, w - 132], y: [20, 32], size: [76, 86] },
    { name: "r", x: [w - 80, w - 70], y: [h * 0.29, h * 0.57], size: [60, 68] },
    { name: "b", x: [w * 0.265, w * 0.47], y: [h - 74, h - 68], size: [54, 60] },
    { name: "l", x: [2, 6], y: [h * 0.38, h * 0.575], size: [64, 72] },
    { name: "bl", x: [20, 26], y: [h - 164, h - 160], size: [74, 78] },
  ];
  if (wide) {
    rest.splice(1, 0, { name: "t2", x: [w * 0.58, w * 0.72], y: [2, 8], size: [54, 62] });
    rest.splice(5, 0, { name: "b2", x: [w * 0.55, w * 0.7], y: [h - 74, h - 68], size: [54, 60] });
  }
  return { corners: { tl, br }, rest };
}

/** Axis aligned bounding box of a square of `size` rotated by `deg` at (x, y). */
function aabb(x: number, y: number, size: number, deg: number) {
  const r = (Math.abs(deg) * Math.PI) / 180;
  const half = (size / 2) * (Math.cos(r) + Math.sin(r));
  const cx = x + size / 2;
  const cy = y + size / 2;
  return { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half };
}

/** Push a placement out of the content box if its rotated box intrudes. Slots already avoid it; this is the guard. */
function keepOut(p: Placement, w: number, h: number): Placement {
  const box = { x0: CONTENT_INSET, y0: CONTENT_INSET, x1: w - CONTENT_INSET, y1: h - CONTENT_INSET };
  for (let i = 0; i < 4; i++) {
    const b = aabb(p.x, p.y, p.size, p.rotate);
    const ox = Math.min(b.x1, box.x1) - Math.max(b.x0, box.x0);
    const oy = Math.min(b.y1, box.y1) - Math.max(b.y0, box.y0);
    if (ox <= 0 || oy <= 0) return p;
    const cx = p.x + p.size / 2;
    const cy = p.y + p.size / 2;
    // Move along the axis with the smaller overlap, away from the box centre.
    if (ox < oy) p = { ...p, x: p.x + (cx < w / 2 ? -ox : ox) };
    else p = { ...p, y: p.y + (cy < h / 2 ? -oy : oy) };
  }
  return p;
}

export function scatter(seed: string, w: number, h: number, mix: string = seed): Placement[] {
  const rng = mulberry32(hash(`${seed}`));
  const pick = mulberry32(hash(`mix:${mix}`));
  const { corners, rest } = slots(w, h);
  const appleTopLeft = rng() < 0.5;
  const appleSlot = appleTopLeft ? corners.tl : corners.br;
  const otherCorner = appleTopLeft ? corners.br : corners.tl;

  // Shuffle the pool (from the mix seed) and the remaining slots, then drop one or two slots so the ring stays uneven.
  const pool = [...SCATTER_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(pick() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const candidates = [otherCorner, ...rest];
  const skip = 1 + (rng() < 0.5 ? 1 : 0);
  for (let s = 0; s < skip; s++) candidates.splice(Math.floor(rng() * candidates.length), 1);

  const out: Placement[] = [];
  const place = (slot: Slot, emoji: string, hero: boolean, size: Range) => {
    const p: Placement = {
      emoji,
      x: Math.round(between(rng, slot.x)),
      y: Math.round(between(rng, slot.y)),
      size: Math.round(between(rng, size)),
      rotate: Math.round(between(rng, [-18, 18])),
      hero,
    };
    out.push(keepOut(p, w, h));
  };
  place(appleSlot, APPLE, true, [116, 120]);
  candidates.forEach((slot, i) => place(slot, pool[i % pool.length], false, slot.size));
  return out;
}
