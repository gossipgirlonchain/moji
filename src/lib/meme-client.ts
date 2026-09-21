/** Browser-side helpers for creator memes: shrink before upload, then POST to /api/mojis/[combo]/meme. */
import { memeRemoveMessage, memeSetMessage } from "./meme-auth";

/**
 * How the caller proves it is the creator. App (X) launches send the Privy access token; wallet and agent
 * launches sign a message from the creator address (`sign` is wagmi's signMessageAsync or a wallet client).
 */
export type MemeAuth = { token: string } | { signer: string; sign: (message: string) => Promise<string> } | null;

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

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `mojiId` is only needed for the wallet-signature path (the message names the moji). */
export async function uploadMeme(t: MemeTarget, file: File, auth: MemeAuth, mojiId?: string | null): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const headers: Record<string, string> = {};
  if (auth && "token" in auth) headers.authorization = `Bearer ${auth.token}`;
  else if (auth && "signer" in auth) {
    if (!mojiId) throw new Error("Cannot sign for this moji yet");
    body.append("signer", auth.signer);
    body.append("signature", await auth.sign(memeSetMessage(mojiId, await sha256Hex(file))));
  }
  const r = await fetch(memeEndpoint(t), { method: "POST", headers, body });
  const j = (await r.json().catch(() => ({}))) as { meme_url?: string; error?: string };
  if (!r.ok || !j.meme_url) throw new Error(j.error ?? "Upload failed");
  return j.meme_url;
}

export async function deleteMeme(t: MemeTarget, auth: MemeAuth, mojiId?: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (auth && "token" in auth) headers.authorization = `Bearer ${auth.token}`;
  else if (auth && "signer" in auth) {
    if (!mojiId) throw new Error("Cannot sign for this moji yet");
    const ts = Date.now();
    headers["content-type"] = "application/json";
    body = JSON.stringify({ signer: auth.signer, signature: await auth.sign(memeRemoveMessage(mojiId, ts)), ts });
  }
  const r = await fetch(memeEndpoint(t), { method: "DELETE", headers, body });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Could not remove the meme");
  }
}
