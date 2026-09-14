import { readFileSync } from "node:fs";
import { CSS_VARS } from "../src/config/design";

/** Fails if src/config/design.ts drifts from :root in src/app/globals.css. */
const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
let fail = 0;
for (const [name, value] of Object.entries(CSS_VARS)) {
  const m = root.match(new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`));
  if (!m) {
    fail++;
    console.log("MISSING in globals.css:", name);
    continue;
  }
  if (norm(m[1]) !== norm(value)) {
    fail++;
    console.log("MISMATCH", name, "\n  css:", m[1].trim(), "\n  ts: ", value);
  }
}
console.log(fail === 0 ? `design tokens OK (${Object.keys(CSS_VARS).length} vars)` : `${fail} token mismatches`);
process.exit(fail ? 1 : 0);
