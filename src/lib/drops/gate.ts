import "server-only";
import { dropsAllowlisted } from "@/config/drops";
import type { MojiRow } from "@/lib/supabase";

export { dropsAllowlisted };

/** Drops are open for every moji. (Was allowlist + admin cookie during testing; the allowlist now only drives the 🪂 marker.) */
export async function dropsEnabled(_m?: Pick<MojiRow, "combo" | "stock_ticker" | "chain_id"> | null): Promise<boolean> {
  return true;
}
