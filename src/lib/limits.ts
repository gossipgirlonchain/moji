import "server-only";
import { supabaseServer, hasSupabase } from "./supabase";
import { NETWORK } from "./network";
import { DEAD_MAX, DEAD_MIN_AGE_MS, DEAD_VOLUME_USD } from "@/config/limits";

export type Quota = { dead: number; max: number; blocked: boolean; message: string | null; deadCombos: string[] };

/** How many of this launcher's mojis are dead, and whether that blocks the next launch. */
export async function launchQuota(did: string): Promise<Quota> {
  const none: Quota = { dead: 0, max: DEAD_MAX, blocked: false, message: null, deadCombos: [] };
  if (!hasSupabase()) return none;
  const before = new Date(Date.now() - DEAD_MIN_AGE_MS).toISOString();
  const { data } = await supabaseServer()
    .from("mojis")
    .select("display, volume_all_usd")
    .eq("network", NETWORK)
    .eq("creator_did", did)
    .not("token_address", "is", null)
    .lt("launched_at", before)
    .or(`volume_all_usd.is.null,volume_all_usd.lt.${DEAD_VOLUME_USD}`);
  const deadCombos = ((data ?? []) as { display: string }[]).map((r) => r.display);
  const dead = deadCombos.length;
  const blocked = dead >= DEAD_MAX;
  return {
    dead,
    max: DEAD_MAX,
    blocked,
    deadCombos,
    message: blocked ? `${dead} of your mojis have no volume yet (${deadCombos.slice(0, 3).join(" ")}). Get one moving to launch another.` : null,
  };
}
