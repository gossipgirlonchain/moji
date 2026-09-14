import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FONT } from "@/config/design";

type SatoriFont = { name: string; data: ArrayBuffer | Buffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900; style: "normal" | "italic" };

/** Fredoka 600 and Nunito 800, self hosted so a render never waits on Google Fonts. Static instances, WOFF. */
let fontsPromise: Promise<SatoriFont[]> | null = null;
export function cardFonts(): Promise<SatoriFont[]> {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), "src", "assets", "fonts");
    fontsPromise = Promise.all([readFile(path.join(dir, "Fredoka-600.woff")), readFile(path.join(dir, "Nunito-800.woff"))]).then(([fredoka, nunito]) => [
      { name: FONT.heading, data: fredoka, weight: 600, style: "normal" },
      { name: FONT.body, data: nunito, weight: 800, style: "normal" },
    ]);
    fontsPromise.catch(() => (fontsPromise = null));
  }
  return fontsPromise;
}
