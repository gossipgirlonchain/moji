import "server-only";
import { isAdmin } from "@/lib/admin";
import { dropsAllowlisted } from "@/config/drops";
import type { MojiRow } from "@/lib/supabase";

export { dropsAllowlisted };

/** Writes (creating drops, the badge) are open for allowlisted pairs; everything else needs the admin cookie. */
export async function dropsEnabled(m?: Pick<MojiRow, "combo" | "stock_ticker" | "chain_id"> | null): Promise<boolean> {
  if (m && dropsAllowlisted(m)) return true;
  return isAdmin();
}
