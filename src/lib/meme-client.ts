/** Browser-side helpers for creator memes: shrink before upload, then POST to /api/mojis/[combo]/meme. */

export const MEME_MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 1024;

export type MemeTarget = { combo: string; chainId: number; pair: string };

export function memeEndpoint(t: MemeTarget) {
  return `/api/mojis/${encodeURIComponent(t.combo)}/meme?chain=${t.chainId}&pair=${encodeURIComponent(t.pair)}`;
}

/**
 * Downsize a static picture to 1024px on the long side in the browser (WebP where the browser can encode it,
 * else PNG), so phone photos upload fast and stay under the 4 MB cap. GIFs are sent as they are, frames intact.
 */
export async function prepareMeme(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a picture (png, jpg, gif, webp).");
  if (file.type === "image/gif") {
    if (file.size > MEME_MAX_BYTES) throw new Error("GIFs are capped at 4 MB.");
    return file;
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    if (file.size > MEME_MAX_BYTES) throw new Error("Pictures are capped at 4 MB.");
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MEME_MAX_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  const out = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!out) throw new Error("Could not read that picture.");
  if (out.size > MEME_MAX_BYTES) throw new Error("Pictures are capped at 4 MB.");
  const name = file.name.replace(/\.[^.]+$/, "") + (out.type === "image/webp" ? ".webp" : ".png");
  return new File([out], name, { type: out.type });
}

export async function uploadMeme(t: MemeTarget, file: File, token: string | null): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const r = await fetch(memeEndpoint(t), { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body });
  const j = (await r.json().catch(() => ({}))) as { meme_url?: string; error?: string };
  if (!r.ok || !j.meme_url) throw new Error(j.error ?? "Upload failed");
  return j.meme_url;
}

export async function deleteMeme(t: MemeTarget, token: string | null): Promise<void> {
  const r = await fetch(memeEndpoint(t), { method: "DELETE", headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Could not remove the meme");
  }
}
