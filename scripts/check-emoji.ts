import { validateCombo, normalizeCombo, graphemes } from "../src/lib/emoji";

const ok = (s: string) => validateCombo(s).ok;
const cases: [string, boolean, string][] = [
  ["🍏", true, "single emoji"],
  ["🍏💻🚀", true, "three emoji"],
  ["🍏💻🚀🔥", false, "four emoji"],
  ["👨‍👩‍👧", true, "ZWJ family is one grapheme"],
  ["👨‍👩‍👧🍏🍕", true, "ZWJ + two = three"],
  ["👍🏽", true, "skin tone allowed"],
  ["✌️", true, "VS16 allowed"],
  ["1️⃣", false, "keycap rejected"],
  ["#️⃣", false, "hash keycap rejected"],
  ["7", false, "digit rejected"],
  ["a🍏", false, "latin rejected"],
  ["🍏 ", true, "trailing space trimmed"],
  ["", false, "empty"],
  ["🇺🇸", true, "flag is one grapheme"],
];
let fail = 0;
for (const [s, want, why] of cases) {
  const got = ok(s);
  if (got !== want) {
    fail++;
    console.log("FAIL", JSON.stringify(s), why, "want", want, "got", got, validateCombo(s));
  }
}
const same = (a: string, b: string) => normalizeCombo(a) === normalizeCombo(b);
if (!same("✌️", "✌")) { fail++; console.log("FAIL ✌️ vs ✌ should match"); }
if (same("👍", "👍🏽")) { fail++; console.log("FAIL 👍 vs 👍🏽 should differ"); }
if (graphemes("👨‍👩‍👧").length !== 1) { fail++; console.log("FAIL ZWJ grapheme count"); }
console.log(fail === 0 ? `emoji rules OK (${cases.length} cases)` : `${fail} failures`);
process.exit(fail ? 1 : 0);
