/**
 * App icon, splash and manifest icons for the iOS shell and home-screen installs, from public/moji.png
 * and the design tokens, so every surface shows the same sky clay square as the favicon and apple-icon:
 *   npm run ios:icons
 * Writes native/assets/{icon,splash,splash-dark}.png (the @capacitor/assets sources, which the same npm
 * script then turns into ios/App/App/Assets.xcassets) and public/icon-{192,512}.png (src/app/manifest.ts).
 * Re-run after changing the wordmark or the sky tokens.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SKY } from "../src/config/design";

const ICON = 1024; // Apple's App Store icon size; every smaller size is derived from it
const SPLASH = 2732; // largest iPad launch image; cropped to every other screen from the centre

/** The apple-icon gradient (src/app/apple-icon.tsx) as SVG: sky-50 to sky-200 to sky-300, top-left to bottom-right. */
function gradientSquare(size: number) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${SKY[50]}"/><stop offset="0.6" stop-color="${SKY[200]}"/><stop offset="1" stop-color="${SKY[300]}"/>` +
      `</linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`,
  );
}

function flatSquare(size: number, color: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`);
}

async function main() {
  const logo = await readFile(path.join("public", "moji.png"));
  const logoAt = (width: number) => sharp(logo).resize({ width }).png().toBuffer();

  // Icon: full-bleed gradient (iOS rounds the corners itself), wordmark at 74% width, inside the maskable safe zone.
  const icon = await sharp(gradientSquare(ICON))
    .composite([{ input: await logoAt(Math.round(ICON * 0.74)), gravity: "centre" }])
    .png()
    .toBuffer();

  // Splash: flat sky-100 (the page background, so the first paint of the site is seamless) with a small wordmark.
  const splash = await sharp(flatSquare(SPLASH, SKY[100]))
    .composite([{ input: await logoAt(600), gravity: "centre" }])
    .png()
    .toBuffer();

  await mkdir(path.join("native", "assets"), { recursive: true });
  const out: [string, Buffer][] = [
    [path.join("native", "assets", "icon.png"), icon],
    [path.join("native", "assets", "splash.png"), splash],
    [path.join("native", "assets", "splash-dark.png"), splash], // the app is light only
    [path.join("public", "icon-512.png"), await sharp(icon).resize(512).png().toBuffer()],
    [path.join("public", "icon-192.png"), await sharp(icon).resize(192).png().toBuffer()],
  ];
  for (const [file, buf] of out) {
    await writeFile(file, buf);
    console.log(`${file.padEnd(32)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB`);
  }
}
main();
