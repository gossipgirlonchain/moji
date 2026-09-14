import "server-only";
import { hasSupabase, supabaseServer, type MojiRow } from "./supabase";
import { NETWORK } from "./network";
import { topEarnersFast } from "./data";
import { EXTENSION_POOL, normalizeCombo } from "./emoji";
import { getPriceSeries } from "./market";
import { dollar, type Fields, type Template } from "./card/params";

/**
 * Live data for the social cards. These are the queries the post queue uses to fill each template, exposed
 * to /design through /api/design/fill so a card can be prefilled and then edited before export.
 */

/** "$4,120", "$0.42", "$1.2M": whole dollars with separators, compact above a million. */
export function money(v: number): string {
  if (!isFinite(v) || v <= 0) return "$0";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v < 10) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** leaderboard: top 3 pairs by fees earned (pending + claimed, from the snapshot). */
export async function leaderboardFill(): Promise<Partial<Fields["leaderboard"]>> {
  const top = await topEarnersFast(3);
  if (!top.length) return {};
  const rows = top.map((r) => ({ emoji: r.display, pair: dollar(r.stock_ticker), figure: money(r.earnedUsd) }));
  while (rows.length < 3) rows.push({ emoji: "", pair: "", figure: "" }); // keep three editable rows
  return { rows };
}

/** open: 8 emoji from the curated pool that nobody has claimed yet on this network. */
export async function openFill(): Promise<Partial<Fields["open"]>> {
  if (!hasSupabase()) return {};
  const pool = EXTENSION_POOL.map((e) => ({ emoji: e, combo: normalizeCombo(e) }));
  const { data } = await supabaseServer().from("claims").select("combo").eq("network", NETWORK).in("combo", pool.map((p) => p.combo));
  const taken = new Set(((data ?? []) as { combo: string }[]).map((r) => r.combo));
  const open = pool.filter((p) => !taken.has(p.combo)).slice(0, 8);
  if (!open.length) return {};
  return { items: open.map((p) => ({ emoji: p.emoji, ticker: "" })) };
}

/** claimed: the pairs launched in the last 7 days (newest first, up to 12) and how many there were. */
export async function claimedFill(): Promise<Partial<Fields["claimed"]>> {
  if (!hasSupabase()) return {};
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const sb = supabaseServer();
  const [{ data }, { count }] = await Promise.all([
    sb.from("mojis").select("display, stock_ticker").eq("network", NETWORK).gte("launched_at", since).order("launched_at", { ascending: false }).limit(12),
    sb.from("mojis").select("id", { count: "exact", head: true }).eq("network", NETWORK).gte("launched_at", since),
  ]);
  const rows = (data ?? []) as Pick<MojiRow, "display" | "stock_ticker">[];
  const n = count ?? rows.length;
  if (!rows.length) return { count: "0 claimed" };
  return { tiles: rows.map((r) => ({ emoji: r.display, ticker: dollar(r.stock_ticker) })), count: `${n.toLocaleString("en-US")} claimed` };
}

/**
 * bignumber: the biggest 7 day price move among the pools with the most 7 day volume. Falls back to the
 * pool with the most 7 day volume when no price history is available.
 */
export async function bignumberFill(): Promise<Partial<Fields["bignumber"]>> {
  if (!hasSupabase()) return {};
  const { data } = await supabaseServer()
    .from("mojis")
    .select("*")
    .eq("network", NETWORK)
    .not("token_address", "is", null)
    .order("volume7d_usd", { ascending: false, nullsFirst: false })
    .limit(10);
  const rows = (data ?? []) as MojiRow[];
  if (!rows.length) return {};
  const moves = await Promise.all(
    rows.map(async (m) => {
      const pts = await getPriceSeries(m, "7D").catch(() => []);
      const first = pts.find((p) => p.value > 0)?.value ?? 0;
      const last = pts.length ? pts[pts.length - 1].value : 0;
      return { m, change: first > 0 && last > 0 ? (last - first) / first : null };
    }),
  );
  const best = moves.filter((x) => x.change !== null).sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))[0];
  if (best && best.change !== null) {
    const pct = Math.round(Math.abs(best.change) * 100);
    return { pair: `${best.m.display} / ${dollar(best.m.stock_ticker)}`, figure: `${best.change >= 0 ? "+" : "-"}${pct.toLocaleString("en-US")}%`, label: "this week" };
  }
  const top = rows[0];
  return { pair: `${top.display} / ${dollar(top.stock_ticker)}`, figure: money(Number(top.volume7d_usd ?? 0)), label: "7 day volume" };
}

export const FILLABLE: Template[] = ["leaderboard", "open", "claimed", "bignumber"];

export async function fillFor(template: Template): Promise<Partial<Fields[Template]> | null> {
  switch (template) {
    case "leaderboard":
      return leaderboardFill();
    case "open":
      return openFill();
    case "claimed":
      return claimedFill();
    case "bignumber":
      return bignumberFill();
    default:
      return null;
  }
}
