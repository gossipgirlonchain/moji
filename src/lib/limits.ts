import "server-only";
import { supabaseServer, hasSupabase } from "./supabase";
import { NETWORK } from "./network";
import { DEAD_MAX, DEAD_MIN_AGE_MS, DEAD_VOLUME_USD, WALLET_DEAD_MAX } from "@/config/limits";

export type Quota = { dead: number; max: number; blocked: boolean; message: string | null; deadCombos: string[] };

/** Who is launching: an X-verified Privy account (by DID) or a bare wallet (by address, tighter cap). */
export type Launcher = { did: string } | { address: string };

/** How many of this launcher's mojis are dead, and whether that blocks the next launch. */
export async function launchQuota(who: Launcher): Promise<Quota> {
  const max = "did" in who ? DEAD_MAX : WALLET_DEAD_MAX;
  const none: Quota = { dead: 0, max, blocked: false, message: null, deadCombos: [] };
  if (!hasSupabase()) return none;
  const before = new Date(Date.now() - DEAD_MIN_AGE_MS).toISOString();
  let q = supabaseServer()
    .from("mojis")
    .select("display, volume_all_usd")
    .eq("network", NETWORK)
    .not("token_address", "is", null)
    .lt("launched_at", before)
    .or(`volume_all_usd.is.null,volume_all_usd.lt.${DEAD_VOLUME_USD}`);
  q = "did" in who ? q.eq("creator_did", who.did) : q.ilike("creator_address", who.address);
  const { data } = await q;
  const deadCombos = ((data ?? []) as { display: string }[]).map((r) => r.display);
  const dead = deadCombos.length;
  const blocked = dead >= max;
  return {
    dead,
    max,
    blocked,
    deadCombos,
    message: blocked ? `${dead} of your mojis have no volume yet (${deadCombos.slice(0, 3).join(" ")}). Get one moving to launch another.` : null,
  };
}
