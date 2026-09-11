import "server-only";
import { hasSupabase, supabaseServer, type MojiRow, type ClaimRow } from "./supabase";
import { normalizeCombo } from "./emoji";
import { NETWORK } from "./network";

export type SortKey = "newest" | "mcap" | "fees";

export async function listMojis(opts: { sort?: SortKey; q?: string; limit?: number } = {}): Promise<MojiRow[]> {
  if (!hasSupabase()) return [];
  const sb = supabaseServer();
  let query = sb.from("mojis").select("*").eq("network", NETWORK);
  if (opts.q) {
    const q = opts.q.trim();
    query = query.or(`display.ilike.%${q}%,stock_ticker.ilike.%${q}%`);
  }
  switch (opts.sort ?? "newest") {
    case "mcap":
      query = query.order("market_cap_usd", { ascending: false, nullsFirst: false });
      break;
    case "fees":
      query = query.order("fees_claimed_usd", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("launched_at", { ascending: false });
  }
  const { data, error } = await query.limit(opts.limit ?? 100);
  if (error) {
    console.error("listMojis", error.message);
    return [];
  }
  return (data ?? []) as MojiRow[];
}

export async function getMoji(comboInput: string): Promise<MojiRow | null> {
  if (!hasSupabase()) return null;
  const combo = normalizeCombo(comboInput);
  const sb = supabaseServer();
  const { data } = await sb.from("mojis").select("*").eq("combo", combo).eq("network", NETWORK).maybeSingle();
  return (data as MojiRow) ?? null;
}

export async function listClaims(): Promise<ClaimRow[]> {
  if (!hasSupabase()) return [];
  const sb = supabaseServer();
  const { data } = await sb.from("claims").select("*").eq("network", NETWORK).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as ClaimRow[];
}

export async function claimsCount(): Promise<number> {
  if (!hasSupabase()) return 0;
  const sb = supabaseServer();
  const { count } = await sb.from("claims").select("combo", { count: "exact", head: true }).eq("network", NETWORK);
  return count ?? 0;
}

export async function isClaimed(normalized: string): Promise<{ claimed: boolean; display?: string }> {
  if (!hasSupabase()) return { claimed: false };
  const sb = supabaseServer();
  const { data } = await sb.from("claims").select("combo, display").eq("combo", normalized).eq("network", NETWORK).maybeSingle();
  return data ? { claimed: true, display: (data as { display: string }).display } : { claimed: false };
}

export async function claimedSet(normalizedList: string[]): Promise<Set<string>> {
  if (!hasSupabase() || normalizedList.length === 0) return new Set();
  const sb = supabaseServer();
  const { data } = await sb.from("claims").select("combo").eq("network", NETWORK).in("combo", normalizedList);
  return new Set(((data ?? []) as { combo: string }[]).map((r) => r.combo));
}
