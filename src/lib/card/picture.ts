import "server-only";
import sharp from "sharp";

/**
 * Pictures on cards: a meme's uploaded image (or any moji with a picture) drawn where an emoji would go.
 * resvg cannot decode WebP or animated GIF, which is what Supabase Storage holds, so each picture is fetched
 * once, cropped to a PICTURE px square and re-encoded as PNG with sharp, then cached for the instance.
 * Only pictures from hosts we serve (the Supabase project, moji.wtf) are fetched.
 */
export const PICTURE = 256;

const ALLOWED_HOSTS = new Set(
  [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SITE_URL || "https://moji.wtf"]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u as string).host;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);

export function pictureAllowed(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.host);
  } catch {
    return false;
  }
}

const cache = new Map<string, Promise<string | null>>();
const MAX_CACHE = 300;

async function load(url: string): Promise<string | null> {
  let bytes: Buffer;
  if (url.startsWith("data:image/")) {
    const comma = url.indexOf(",");
    bytes = Buffer.from(url.slice(comma + 1), "base64");
  } else {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "force-cache" });
    if (!r.ok) return null;
    bytes = Buffer.from(await r.arrayBuffer());
  }
  if (bytes.length > 12 * 1024 * 1024) return null;
  const png = await sharp(bytes, { animated: false }).resize(PICTURE, PICTURE, { fit: "cover", position: "centre" }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** PNG data URL for a picture URL, or null when it cannot be fetched or decoded (the caller falls back to text). */
export function loadPicture(url: string): Promise<string | null> {
  if (!pictureAllowed(url)) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    p = load(url).catch(() => null);
    cache.set(url, p);
    p.then((v) => v === null && cache.delete(url));
  }
  return p;
}

export type Pictures = Map<string, string>;

export async function resolvePictures(urls: Iterable<string>): Promise<Pictures> {
  const out: Pictures = new Map();
  await Promise.all([...new Set([...urls].filter(Boolean))].map(async (u) => {
    const v = await loadPicture(u);
    if (v) out.set(u, v);
  }));
  return out;
}
