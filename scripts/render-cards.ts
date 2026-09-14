/**
 * Render every social card template to PNG for a visual check, without a dev server.
 *   npm run cards:preview [-- outDir]      (NODE_PATH=scripts/stubs TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/render-cards.ts)
 * Covers both canvases plus the edge cases: an 8 word and a 2 word headline, a long ticker,
 * a skin tone emoji and a ZWJ sequence, 8 open items, 12 claimed tiles.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderCard } from "../src/lib/card/render";
import { parseCardParams, toSearchParams, defaultFields, type CardSpec, type Template } from "../src/lib/card/params";

const out = process.argv[2] ?? "card-previews";
const sizes = [
  { w: 1200, h: 1200 },
  { w: 1600, h: 900 },
];

const specs: { name: string; spec: CardSpec }[] = [];
const add = (name: string, template: Template, fields: Partial<CardSpec["fields"]>, seed = "1", size = sizes) => {
  for (const s of size) specs.push({ name: `${name}-${s.w}x${s.h}`, spec: { template, ...s, seed, fields: { ...defaultFields(template), ...fields } } as CardSpec });
};
for (const t of ["announcement", "pair", "leaderboard", "open", "claimed", "bignumber", "token"] as Template[]) add(t, t, {}, "7");
add("token-2stats", "token", { combo: "🚀🌙", ticker: "SPCE", creator: "", stats: [{ label: "volume 7d", value: "$1,207,442" }, { label: "market cap", value: "$9.4M" }] }, "12");
add("announcement-8words", "announcement", { headline: "every single emoji pair now earns creators real money", subline: "fees paid on every trade, forever" }, "3");
add("announcement-2words", "announcement", { headline: "still open", subline: "" }, "4");
add("pair-skintone", "pair", { combo: "👍🏽", ticker: "ROBINHOOD", label: "just claimed" }, "5");
add("pair-zwj", "pair", { combo: "👨‍👩‍👧🚀", ticker: "HOOD", label: "" }, "6");
add("open-8", "open", { items: [...defaultFields("open").items, { emoji: "🐸", ticker: "$FROG" }, { emoji: "🦄", ticker: "$UNI" }] }, "8");
add("open-noticker", "open", { items: ["🐸", "🦄", "🍒", "🌊", "👑", "🎲", "🍩"].map((e) => ({ emoji: e, ticker: "" })) }, "9");
add("claimed-12", "claimed", { tiles: [...defaultFields("claimed").tiles, { emoji: "🐸🦄", ticker: "$FROG" }, { emoji: "🇺🇸", ticker: "$SPY" }], count: "12 claimed" }, "10");
add("bignumber-long", "bignumber", { pair: "🍎💻🚀 / $AAPL", figure: "$1,234,567", label: "7 day volume" }, "11");

async function main() {
  await mkdir(out, { recursive: true });
  let failed = 0;
  for (const { name, spec } of specs) {
    // Round trip through the query string, exactly as /design and the post queue do.
    const parsed = parseCardParams(toSearchParams(spec));
    if (!parsed.ok) throw new Error(`${name}: ${parsed.error}`);
    const t0 = Date.now();
    try {
      const res = await renderCard(parsed.spec);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(path.join(out, `${name}.png`), buf);
      console.log(`${name.padEnd(28)} ${String(buf.length).padStart(7)} bytes  ${Date.now() - t0}ms`);
    } catch (e) {
      failed++;
      console.error(`${name} FAILED`, e);
    }
  }
  console.log(failed ? `${failed} failed` : `rendered ${specs.length} cards to ${out}/`);
  process.exit(failed ? 1 : 0);
}
main();
