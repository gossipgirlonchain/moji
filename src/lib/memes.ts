import "server-only";
import sharp from "sharp";
import { supabaseServer, type MojiRow } from "./supabase";
import { IMAGE_BUCKET, imagePath } from "./images";
import { NETWORK } from "./network";

/** Upload cap. Vercel rejects request bodies over 4.5 MB, and the client downsizes static images before sending. */
export const MEME_MAX_BYTES = 4 * 1024 * 1024;
const STATIC_MAX_SIDE = 1024;
const ANIMATED_MAX_SIDE = 512;

const INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export type ProcessedMeme = { bytes: Buffer; contentType: string; ext: "webp" | "gif"; width: number; height: number; animated: boolean };

/**
 * Normalize an uploaded picture: EXIF-rotated, downsized to fit 1024px and re-encoded as WebP; animated GIFs
 * and WebPs keep their frames, downsized to 512px, as GIF. Throws on anything that is not a decodable image.
 */
export async function processMeme(input: Buffer): Promise<ProcessedMeme> {
  const unreadable = new Error("That file is not an image we can read (png, jpg, gif, webp).");
  const meta = await sharp(input, { animated: true, limitInputPixels: 40_000_000 }).metadata().catch(() => {
    throw unreadable;
  });
  if (!meta.format || !INPUT_FORMATS.has(meta.format)) throw unreadable;
  const animated = (meta.pages ?? 1) > 1;
  if (animated) {
    const out = sharp(input, { animated: true }).resize({ width: ANIMATED_MAX_SIDE, height: ANIMATED_MAX_SIDE, fit: "inside", withoutEnlargement: true }).gif();
    const { data, info } = await out.toBuffer({ resolveWithObject: true });
    return { bytes: data, contentType: "image/gif", ext: "gif", width: info.width, height: info.pageHeight ?? info.height, animated: true };
  }
  const out = sharp(input).rotate().resize({ width: STATIC_MAX_SIDE, height: STATIC_MAX_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 });
  const { data, info } = await out.toBuffer({ resolveWithObject: true });
  return { bytes: data, contentType: "image/webp", ext: "webp", width: info.width, height: info.height, animated: false };
}

function memePath(m: Pick<MojiRow, "id">, ext: string) {
  return `${NETWORK}/memes/${m.id}.${ext}`;
}

/** Store a processed meme for this moji (one file per moji, replaced on re-upload). Returns a cache-busted public URL. */
export async function storeMeme(m: Pick<MojiRow, "id">, meme: ProcessedMeme): Promise<string> {
  const sb = supabaseServer();
  const bucket = sb.storage.from(IMAGE_BUCKET);
  // The previous meme may have the other extension; drop both so a stale file never lingers.
  await bucket.remove([memePath(m, "webp"), memePath(m, "gif")]);
  const path = memePath(m, meme.ext);
  const { error } = await bucket.upload(path, meme.bytes, { contentType: meme.contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  const { data } = bucket.getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Delete the stored meme and return the URL of the rendered emoji image, for image_url to fall back to. */
export async function removeMeme(m: Pick<MojiRow, "id" | "combo">): Promise<string> {
  const sb = supabaseServer();
  const bucket = sb.storage.from(IMAGE_BUCKET);
  await bucket.remove([memePath(m, "webp"), memePath(m, "gif")]);
  return bucket.getPublicUrl(imagePath(m.combo)).data.publicUrl;
}
