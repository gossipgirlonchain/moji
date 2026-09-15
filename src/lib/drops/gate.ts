import "server-only";
import { isAdmin } from "@/lib/admin";
import { DROPS_ALLOWLIST, parseAllowlistEntry } from "@/config/drops";
import { normalizeCombo } from "@/lib/emoji";
import type { MojiRow } from "@/lib/supabase";

type PairKey = Pick<MojiRow, "combo" | "stock_ticker" | "chain_id">;

/** True when this exact pair (combo + ticker + chain) is on the allowlist in src/config/drops.ts. */
export function dropsAllowlisted(m: PairKey): boolean {
  return DROPS_ALLOWLIST.some((e) => {
    const a = parseAllowlistEntry(e);
    if (!a) return false;
    let combo = a.combo;
    try {
      combo = normalizeCombo(a.combo);
    } catch {}
    return combo === m.combo && a.ticker === m.stock_ticker.toUpperCase() && a.chainId === m.chain_id;
  });
}

export async function dropsEnabled(m?: PairKey | null): Promise<boolean> {
  if (m && dropsAllowlisted(m)) return true;
  return isAdmin();
}
