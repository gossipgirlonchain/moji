import "server-only";
import { supabaseServer, hasSupabase } from "./supabase";
import { NETWORK } from "./network";
import { DEAD_MAX, DEAD_MIN_AGE_MS, DEAD_VOLUME_USD, WALLET_LAUNCH_SLOTS } from "@/config/limits";

export type Quota = {
  /** "dead" for X accounts (dead-moji cap), "slots" for wallets (launch slots, nothing dies) */
  rule: "dead" | "slots";
  blocked: boolean;
  message: string | null;
  /** dead rule */
  dead: number;
  max: number;
  deadCombos: string[];
  /** slots rule */
  launched: number;
  slots: number;
  mojis: string[];
};

/** Who is launching: an X-verified Privy account (by DID) or a bare wallet (by address). */
export type Launcher = { did: string } | { address: string };

/**
 * May this launcher launch another moji right now?
 *  - X accounts: the dead-moji cap. DEAD_MAX mojis older than DEAD_MIN_AGE_MS with under DEAD_VOLUME_USD block the next.
 *  - Wallets: launch slots. A wallet has WALLET_LAUNCH_SLOTS launches; nothing dies and nothing expires.
 */
export async function launchQuota(who: Launcher): Promise<Quota> {
  const base: Quota = { rule: "did" in who ? "dead" : "slots", blocked: false, message: null, dead: 0, max: DEAD_MAX, deadCombos: [], launched: 0, slots: WALLET_LAUNCH_SLOTS, mojis: [] };
  if (!hasSupabase()) return base;
  if ("did" in who) {
    const before = new Date(Date.now() - DEAD_MIN_AGE_MS).toISOString();
    const { data } = await supabaseServer()
      .from("mojis")
      .select("display, volume_all_usd")
      .eq("network", NETWORK)
      .eq("creator_did", who.did)
      .not("token_address", "is", null)
      .lt("launched_at", before)
      .or(`volume_all_usd.is.null,volume_all_usd.lt.${DEAD_VOLUME_USD}`);
    const deadCombos = ((data ?? []) as { display: string }[]).map((r) => r.display);
    const dead = deadCombos.length;
    const blocked = dead >= DEAD_MAX;
    return { ...base, dead, deadCombos, blocked, message: blocked ? `${dead} of your mojis have no volume yet (${deadCombos.slice(0, 3).join(" ")}). Get one moving to launch another.` : null };
  }
  const { data } = await supabaseServer().from("mojis").select("display").eq("network", NETWORK).ilike("creator_address", who.address).not("token_address", "is", null).order("launched_at", { ascending: true });
  const mojis = ((data ?? []) as { display: string }[]).map((r) => r.display);
  const launched = mojis.length;
  const blocked = launched >= WALLET_LAUNCH_SLOTS;
  return { ...base, launched, mojis, blocked, message: blocked ? `This wallet has used its ${WALLET_LAUNCH_SLOTS === 1 ? "launch" : `${WALLET_LAUNCH_SLOTS} launches`} (${mojis.slice(0, 3).join(" ")}). Your moji is who you are; more slots are earned, not bought.` : null };
}
