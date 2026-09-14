/**
 * Bake the PNG sprites /api/card draws instead of letting satori blur at request time:
 *   - src/assets/clay:  the clay card per canvas and background, the clay-sm circle, tile and pill slices
 *   - src/assets/emoji: glyph + shadow sprites for every Noto SVG in that folder (the scatter pool)
 * Everything derives from the design tokens and the pinned Noto SVGs, so re-run after changing either:
 *   npm run cards:assets
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SIZES } from "../src/lib/card/params";
import { ARTBOARD_INSET } from "../src/lib/card/scatter";
import { allAssets, assetName, renderAsset } from "../src/lib/card/clay";
import { EMOJI_DIR, rasterGlyph, rasterShadow } from "../src/lib/card/emoji";

async function main() {
  const clayDir = path.join("src", "assets", "clay");
  await mkdir(clayDir, { recursive: true });
  let total = 0;
  for (const a of allAssets(SIZES.map((s) => ({ w: s.w - 2 * ARTBOARD_INSET, h: s.h - 2 * ARTBOARD_INSET })))) {
    const t0 = Date.now();
    const buf = await renderAsset(a);
    await writeFile(path.join(clayDir, assetName(a)), buf);
    total += buf.length;
    console.log(`clay/${assetName(a).padEnd(28)} ${String(buf.length).padStart(7)} bytes  ${Date.now() - t0}ms`);
  }
  const svgs = (await readdir(EMOJI_DIR)).filter((f) => f.endsWith(".svg")).sort();
  for (const f of svgs) {
    const code = f.replace(/\.svg$/, "");
    const svg = await readFile(path.join(EMOJI_DIR, f), "utf8");
    const t0 = Date.now();
    const [glyph, shadow] = await Promise.all([rasterGlyph(svg), rasterShadow(svg)]);
    await writeFile(path.join(EMOJI_DIR, `${code}.png`), glyph);
    await writeFile(path.join(EMOJI_DIR, `${code}.shadow.png`), shadow);
    total += glyph.length + shadow.length;
    console.log(`emoji/${code.padEnd(28)} ${String(glyph.length).padStart(6)} + ${String(shadow.length).padStart(6)} bytes  ${Date.now() - t0}ms`);
  }
  console.log(`done, ${(total / 1024).toFixed(0)} KB of sprites`);
}
main();
