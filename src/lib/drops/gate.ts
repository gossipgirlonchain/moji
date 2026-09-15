import "server-only";
import { isAdmin } from "@/lib/admin";
import { DROPS_ALLOWLIST } from "@/config/drops";
import { normalizeCombo } from "@/lib/emoji";
import type { MojiRow } from "@/lib/supabase";

/**
 * Drops are in testing. A moji's drops surfaces are open when the moji is on the allowlist
 * (src/config/drops.ts, 🍎 first); everything else needs the admin cookie.
 */
export function dropsAllowlisted(m: Pick<MojiRow, "combo">): boolean {
  const c = m.combo;
  return DROPS_ALLOWLIST.some((a) => {
    try {
      return normalizeCombo(a) === c;
    } catch {
      return a === c;
    }
  });
}

export async function dropsEnabled(m?: Pick<MojiRow, "combo"> | null): Promise<boolean> {
  if (m && dropsAllowlisted(m)) return true;
  return isAdmin();
}
