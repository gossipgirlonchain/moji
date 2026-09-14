/**
 * The card spec: one URL <-> one image. Shared by /design (builds the URL) and /api/card (renders it),
 * so the preview, the download and the post queue all go through the same renderer.
 */
export const TEMPLATES = ["announcement", "pair", "leaderboard", "open", "claimed", "bignumber"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<Template, string> = {
  announcement: "announcement",
  pair: "pair card",
  leaderboard: "leaderboard",
  open: "still open",
  claimed: "claimed this week",
  bignumber: "big number",
};

/** The two supported canvases. 1600x900 is what X shows uncropped in the timeline. */
export const SIZES = [
  { w: 1600, h: 900, label: "1600 × 900" },
  { w: 1200, h: 1200, label: "1200 × 1200" },
] as const;
export const DEFAULT_SIZE = { w: 1200, h: 1200 };
export function isSupportedSize(w: number, h: number): boolean {
  return SIZES.some((s) => s.w === w && s.h === h);
}

export type EmojiItem = { emoji: string; ticker: string };
export type LeaderboardRow = { emoji: string; pair: string; figure: string };

export type Fields = {
  announcement: { headline: string; subline: string };
  pair: { combo: string; ticker: string; label: string };
  leaderboard: { title: string; rows: LeaderboardRow[] };
  open: { title: string; items: EmojiItem[] };
  claimed: { title: string; tiles: EmojiItem[]; count: string };
  bignumber: { pair: string; figure: string; label: string };
};

export type CardSpec<T extends Template = Template> = {
  template: T;
  w: number;
  h: number;
  seed: string;
  fields: Fields[T];
};

export const LIMITS = {
  headlineWords: 8,
  leaderboardRows: 3,
  openMin: 6,
  openMax: 8,
  claimedMin: 8,
  claimedMax: 12,
  text: 160,
} as const;

/** Reference copy from the design handoff, so a fresh /design shows a finished card. */
export const SAMPLE: { [T in Template]: Fields[T] } = {
  announcement: { headline: "creators earn on every trade", subline: "moji.wtf" },
  pair: { combo: "🍎", ticker: "AAPL", label: "JUST CLAIMED" },
  leaderboard: {
    title: "top earners",
    rows: [
      { emoji: "🐕", pair: "$NVDA", figure: "$4,120" },
      { emoji: "🍕", pair: "$DPZ", figure: "$2,884" },
      { emoji: "🚀🌙", pair: "$SPCE", figure: "$1,207" },
    ],
  },
  open: {
    title: "still open",
    items: [
      { emoji: "🦖", ticker: "$DINO" },
      { emoji: "🧊", ticker: "$ICE" },
      { emoji: "🪝", ticker: "$HOOK" },
      { emoji: "🫧", ticker: "$BUBL" },
      { emoji: "🛼", ticker: "$ROLL" },
      { emoji: "🧲", ticker: "$MAG" },
    ],
  },
  claimed: {
    title: "claimed this week",
    tiles: [
      { emoji: "🪙", ticker: "$GLD" },
      { emoji: "☕", ticker: "$SBUX" },
      { emoji: "✈️", ticker: "$DAL" },
      { emoji: "🏠", ticker: "$ZG" },
      { emoji: "💊", ticker: "$PFE" },
      { emoji: "🪟", ticker: "$MSFT" },
      { emoji: "🎢", ticker: "$FUN" },
      { emoji: "🩹", ticker: "$JNJ" },
      { emoji: "💻", ticker: "$DELL" },
      { emoji: "🚀", ticker: "$RKLB" },
    ],
    count: "1,842 claimed",
  },
  bignumber: { pair: "🧇 / $TSM", figure: "+340%", label: "this week" },
};

export function defaultFields<T extends Template>(template: T): Fields[T] {
  return structuredClone(SAMPLE[template]);
}

export function isTemplate(s: string | null | undefined): s is Template {
  return TEMPLATES.includes(s as Template);
}

const SEP = "|";
const joinItem = (parts: string[]) => parts.map((p) => p.replaceAll(SEP, "/")).join(SEP);
const splitItem = (s: string, n: number): string[] => {
  const parts = s.split(SEP);
  while (parts.length < n) parts.push("");
  return parts.slice(0, n);
};

/** Serialize a spec to the query string /api/card understands. Deterministic key order so equal specs give equal URLs. */
export function toSearchParams(spec: CardSpec): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("template", spec.template);
  sp.set("w", String(spec.w));
  sp.set("h", String(spec.h));
  sp.set("seed", spec.seed);
  switch (spec.template) {
    case "announcement": {
      const f = spec.fields as Fields["announcement"];
      sp.set("headline", f.headline);
      if (f.subline) sp.set("subline", f.subline);
      break;
    }
    case "pair": {
      const f = spec.fields as Fields["pair"];
      sp.set("combo", f.combo);
      sp.set("ticker", f.ticker);
      if (f.label) sp.set("label", f.label);
      break;
    }
    case "leaderboard": {
      const f = spec.fields as Fields["leaderboard"];
      sp.set("title", f.title);
      for (const r of f.rows) sp.append("row", joinItem([r.emoji, r.pair, r.figure]));
      break;
    }
    case "open": {
      const f = spec.fields as Fields["open"];
      sp.set("title", f.title);
      for (const i of f.items) sp.append("item", joinItem([i.emoji, i.ticker]));
      break;
    }
    case "claimed": {
      const f = spec.fields as Fields["claimed"];
      sp.set("title", f.title);
      for (const t of f.tiles) sp.append("tile", joinItem([t.emoji, t.ticker]));
      sp.set("count", f.count);
      break;
    }
    case "bignumber": {
      const f = spec.fields as Fields["bignumber"];
      sp.set("pair", f.pair);
      sp.set("figure", f.figure);
      if (f.label) sp.set("label", f.label);
      break;
    }
  }
  return sp;
}

export function cardUrl(spec: CardSpec, origin = ""): string {
  return `${origin}/api/card?${toSearchParams(spec).toString()}`;
}

const clean = (v: string | null | undefined, max: number = LIMITS.text) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Parse a query string into a spec. Missing fields fall back to the sample copy; bad sizes and templates are errors. */
export function parseCardParams(sp: URLSearchParams): { ok: true; spec: CardSpec } | { ok: false; error: string } {
  const template = sp.get("template") ?? "announcement";
  if (!isTemplate(template)) return { ok: false, error: `unknown template: ${template}. one of ${TEMPLATES.join(", ")}` };
  const w = Number(sp.get("w") ?? DEFAULT_SIZE.w);
  const h = Number(sp.get("h") ?? DEFAULT_SIZE.h);
  if (!isSupportedSize(w, h)) return { ok: false, error: `unsupported size ${w}x${h}. use ${SIZES.map((s) => `${s.w}x${s.h}`).join(" or ")}` };
  const seed = clean(sp.get("seed"), 64) || "1";
  const sample = SAMPLE;
  const has = (k: string) => sp.has(k);
  let fields: Fields[Template];
  switch (template) {
    case "announcement":
      fields = { headline: has("headline") ? clean(sp.get("headline")) : sample.announcement.headline, subline: clean(sp.get("subline"), 80) };
      break;
    case "pair":
      fields = {
        combo: has("combo") ? clean(sp.get("combo"), 24) : sample.pair.combo,
        ticker: has("ticker") ? clean(sp.get("ticker"), 16) : sample.pair.ticker,
        label: clean(sp.get("label"), 32),
      };
      break;
    case "leaderboard": {
      const rows = sp.getAll("row").map((r) => splitItem(r, 3)).map(([emoji, pair, figure]) => ({ emoji: clean(emoji, 24), pair: clean(pair, 24), figure: clean(figure, 24) }));
      fields = { title: has("title") ? clean(sp.get("title"), 40) : sample.leaderboard.title, rows: (rows.length ? rows : sample.leaderboard.rows).slice(0, LIMITS.leaderboardRows) };
      break;
    }
    case "open": {
      const items = sp.getAll("item").map((r) => splitItem(r, 2)).map(([emoji, ticker]) => ({ emoji: clean(emoji, 24), ticker: clean(ticker, 16) }));
      fields = { title: has("title") ? clean(sp.get("title"), 40) : sample.open.title, items: (items.length ? items : sample.open.items).slice(0, LIMITS.openMax) };
      break;
    }
    case "claimed": {
      const tiles = sp.getAll("tile").map((r) => splitItem(r, 2)).map(([emoji, ticker]) => ({ emoji: clean(emoji, 24), ticker: clean(ticker, 16) }));
      fields = {
        title: has("title") ? clean(sp.get("title"), 40) : sample.claimed.title,
        tiles: (tiles.length ? tiles : sample.claimed.tiles).slice(0, LIMITS.claimedMax),
        count: has("count") ? clean(sp.get("count"), 40) : sample.claimed.count,
      };
      break;
    }
    case "bignumber":
      fields = {
        pair: has("pair") ? clean(sp.get("pair"), 40) : sample.bignumber.pair,
        figure: has("figure") ? clean(sp.get("figure"), 16) : sample.bignumber.figure,
        label: has("label") ? clean(sp.get("label"), 40) : "",
      };
      break;
  }
  return { ok: true, spec: { template, w, h, seed, fields } as CardSpec };
}

/** "AAPL" or "$aapl" -> "$AAPL" */
export function dollar(ticker: string): string {
  const t = ticker.trim().replace(/^\$+/, "");
  return t ? `$${t.toUpperCase()}` : "";
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}
