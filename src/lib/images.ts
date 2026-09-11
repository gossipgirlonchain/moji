import "server-only";
import { supabaseServer } from "./supabase";
import { renderTokenImage } from "./render";
import { comboKey } from "./emoji";
import { NETWORK } from "./network";

export const IMAGE_BUCKET = "moji-images";

export function imagePath(normalized: string): string {
  return `${NETWORK}/${comboKey(normalized)}.png`;
}

/** Render the 512px token PNG and store it in Supabase Storage. Returns the public URL. */
export async function storeMojiImage(display: string, normalized: string): Promise<string | null> {
  const res = renderTokenImage(display);
  const bytes = Buffer.from(await res.arrayBuffer());
  const sb = supabaseServer();
  const path = imagePath(normalized);
  const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  const { data } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}
