import "server-only";
import { hasSupabase, supabaseServer, type MojiRow } from "./supabase";
import { NETWORK } from "./network";
import { claimsCount, getMoji, topEarnersFast } from "./data";
import { EXTENSION_POOL, normalizeCombo } from "./emoji";
import { getPriceSeries } from "./market";
import { dateShort, timeAgo } from "./format";
import type { DropRow } from "./drops/types";
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
const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const earned = (m: MojiRow) => n(m.fees_claimed_usd) + n(m.fees_unclaimed_usd);

/** Ranking metrics for the leaderboard. */
export const METRICS = {
  fees: { title: "top earners", col: "fees_total_usd", value: earned },
  volume7d: { title: "top volume this week", col: "volume7d_usd", value: (m: MojiRow) => n(m.volume7d_usd) },
  volume24: { title: "top volume today", col: "volume24_usd", value: (m: MojiRow) => n(m.volume24_usd) },
  mcap: { title: "biggest by market cap", col: "market_cap_usd", value: (m: MojiRow) => n(m.market_cap_usd) },
} as const;
export type Metric = keyof typeof METRICS;
export const isMetric = (s: string | null | undefined): s is Metric => Boolean(s) && s! in METRICS;

/** Statistics for the big number card: the biggest mover, or a protocol wide total. */
export const STATS = {
  mover: "biggest 7 day mover",
  volume7d: "volume this week",
  volume24: "volume today",
  claims: "combos claimed",
  fees: "creator fees",
  mcap: "combined market cap",
  launches7d: "new pairs this week",
  drops: "paid in airdrops",
} as const;
export type Stat = keyof typeof STATS;
export const isStat = (s: string | null | undefined): s is Stat => Boolean(s) && s! in STATS;

async function livePools(orderCol?: string, limit = 5000): Promise<MojiRow[]> {
  if (!hasSupabase()) return [];
  let q = supabaseServer().from("mojis").select("*").eq("network", NETWORK).not("token_address", "is", null);
  if (orderCol) q = q.order(orderCol, { ascending: false, nullsFirst: false });
  const { data } = await q.limit(limit);
  return (data ?? []) as MojiRow[];
}

/** leaderboard: top 3 pairs by the chosen metric (fees earned by default), from the snapshot columns. */
export async function leaderboardFill(metric: Metric = "fees"): Promise<Partial<Fields["leaderboard"]>> {
  const m = METRICS[metric];
  const top = metric === "fees" ? await topEarnersFast(3) : (await livePools(m.col, 50)).sort((a, b) => m.value(b) - m.value(a)).slice(0, 3);
  if (!top.length) return {};
  const rows = top.map((r) => ({ emoji: r.display, pair: dollar(r.stock_ticker), figure: money(m.value(r)) }));
  while (rows.length < 3) rows.push({ emoji: "", pair: "", figure: "" }); // keep three editable rows
  return { title: m.title, rows };
}

/** pair: the most recent launch, as a "just claimed" card. */
export async function pairFill(): Promise<Partial<Fields["pair"]>> {
  const [m] = await livePools("launched_at", 1);
  return m ? { combo: m.display, ticker: dollar(m.stock_ticker).slice(1), label: "JUST CLAIMED" } : {};
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
  const total = count ?? rows.length;
  if (!rows.length) return { count: "0 claimed" };
  return { tiles: rows.map((r) => ({ emoji: r.display, ticker: dollar(r.stock_ticker) })), count: `${total.toLocaleString("en-US")} claimed` };
}

/** The biggest 7 day price move among the pools with the most 7 day volume; falls back to the volume leader. */
async function biggestMover(): Promise<Partial<Fields["bignumber"]>> {
  const rows = await livePools("volume7d_usd", 10);
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
  return { pair: `${top.display} / ${dollar(top.stock_ticker)}`, figure: money(n(top.volume7d_usd)), label: "7 day volume" };
}

/** bignumber: the biggest mover, or a total across every pair. */
export async function bignumberFill(stat: Stat = "mover"): Promise<Partial<Fields["bignumber"]>> {
  if (stat === "mover") return biggestMover();
  if (!hasSupabase()) return {};
  if (stat === "claims") {
    const c = await claimsCount();
    return { pair: "since launch", figure: c.toLocaleString("en-US"), label: "combos claimed" };
  }
  if (stat === "launches7d") {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { count } = await supabaseServer().from("mojis").select("id", { count: "exact", head: true }).eq("network", NETWORK).gte("launched_at", since);
    return { pair: "this week", figure: (count ?? 0).toLocaleString("en-US"), label: "new pairs" };
  }
  if (stat === "drops") {
    const { data } = await supabaseServer().from("drops").select("sent_usd, sent_count").eq("network", NETWORK).gt("sent_count", 0).limit(5000);
    const rows = (data ?? []) as Pick<DropRow, "sent_usd" | "sent_count">[];
    const total = rows.reduce((acc, d) => acc + n(d.sent_usd), 0);
    return { pair: `${rows.length.toLocaleString("en-US")} airdrops`, figure: money(total), label: "paid to holders" };
  }
  const pools = await livePools();
  const sum = (f: (m: MojiRow) => number) => pools.reduce((acc, m) => acc + f(m), 0);
  switch (stat) {
    case "volume7d":
      return { pair: "all pairs", figure: money(sum((m) => n(m.volume7d_usd))), label: "traded this week" };
    case "volume24":
      return { pair: "all pairs", figure: money(sum((m) => n(m.volume24_usd))), label: "traded today" };
    case "fees":
      return { pair: "all creators", figure: money(sum(earned)), label: "earned in fees" };
    case "mcap":
      return { pair: "all pairs", figure: money(sum((m) => n(m.market_cap_usd))), label: "combined market cap" };
  }
}

/** token: one pair's stats, looked up by combo and ticker exactly like the moji page does. */
export async function tokenFill(combo: string, ticker: string): Promise<Partial<Fields["token"]> | null> {
  if (!combo.trim()) return null;
  const m = await getMoji(combo, ticker.trim().replace(/^\$/, "") || null);
  if (!m) return null;
  const who = m.creator_handle ? `launched by @${m.creator_handle}` : "launched";
  return {
    combo: m.display,
    ticker: m.stock_ticker,
    creator: `${who} · ${timeAgo(m.launched_at)}`,
    stats: [
      { label: "market cap", value: money(n(m.market_cap_usd)) },
      { label: "volume 24h", value: money(n(m.volume24_usd)) },
      { label: "volume 7d", value: money(n(m.volume7d_usd)) },
      { label: "fees earned", value: money(earned(m)) },
    ],
  };
}

/** Amount of a drop token in plain words: "0.5 $MSFT" or "12,000 🪟". */
function dropAmount(d: DropRow): string {
  const v = n(d.amount);
  const num = v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return d.token_kind === "stock" ? `${num} ${dollar(d.token_symbol)}` : `${num} ${d.token_symbol}`;
}

export type RecentDrop = { id: string; when: string; paidUsd: number; fields: Fields["airdrop"] };

/**
 * Recent airdrops (rows of the `drops` table) that actually paid holders, newest first, shaped as airdrop card fields:
 * figure is the USD paid, the summary line says what went to how many holders, and the tiles carry
 * holders paid, median and biggest payout, and the rule the creator set.
 */
export async function recentDrops(limit = 30): Promise<RecentDrop[]> {
  if (!hasSupabase()) return [];
  const sb = supabaseServer();
  const { data } = await sb.from("drops").select("*").eq("network", NETWORK).gt("sent_count", 0).order("created_at", { ascending: false }).limit(limit);
  const drops = (data ?? []) as DropRow[];
  if (!drops.length) return [];
  const [{ data: mojis }, { data: payouts }] = await Promise.all([
    sb.from("mojis").select("id, display, stock_ticker").in("id", [...new Set(drops.map((d) => d.moji_id))]),
    sb.from("drop_payouts").select("drop_id, amount_usd").in("drop_id", drops.map((d) => d.id)).not("tx_hash", "is", null).limit(5000),
  ]);
  const byMoji = new Map(((mojis ?? []) as Pick<MojiRow, "id" | "display" | "stock_ticker">[]).map((m) => [m.id, m]));
  const paid = new Map<string, number[]>();
  for (const p of (payouts ?? []) as { drop_id: string; amount_usd: number }[]) paid.set(p.drop_id, [...(paid.get(p.drop_id) ?? []), n(p.amount_usd)]);
  return drops.flatMap((d) => {
    const m = byMoji.get(d.moji_id);
    if (!m) return [];
    const amounts = (paid.get(d.id) ?? []).sort((a, b) => a - b);
    const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
    const max = amounts.length ? amounts[amounts.length - 1] : 0;
    const when = d.completed_at ?? d.created_at;
    const rule = d.hold_days > 0 ? `held ${d.hold_days}d+` : `top ${d.top_n}`;
    const stats = [
      { label: "holders paid", value: d.sent_count.toLocaleString("en-US") },
      { label: "median payout", value: money(median) },
      { label: "biggest payout", value: money(max) },
      { label: "rule", value: rule },
    ];
    return [
      {
        id: d.id,
        when,
        paidUsd: n(d.sent_usd),
        fields: {
          combo: m.display,
          ticker: m.stock_ticker,
          label: "🪂 AIRDROP",
          figure: n(d.sent_usd) > 0 ? money(n(d.sent_usd)) : dropAmount(d),
          sub: `${dropAmount(d)} airdropped to ${d.sent_count.toLocaleString("en-US")} holders · ${dateShort(when)}`,
          stats,
        },
      },
    ];
  });
}

/** airdrop: the latest airdrop that paid holders, or a given pair's latest drop when combo + ticker are passed. */
export async function airdropFill(combo = "", ticker = ""): Promise<Partial<Fields["airdrop"]> | null> {
  const all = await recentDrops(60);
  if (!all.length) return null;
  if (combo.trim()) {
    const want = normalizeCombo(combo);
    const t = ticker.trim().replace(/^\$/, "").toUpperCase();
    const hit = all.find((d) => normalizeCombo(d.fields.combo) === want && (!t || d.fields.ticker.toUpperCase() === t));
    return hit ? hit.fields : null;
  }
  return all[0].fields;
}

/** airdrops: every airdrop that paid holders in the last 7 days (falls back to the last 8 overall), plus the total. */
export async function airdropsFill(): Promise<Partial<Fields["airdrops"]> | null> {
  const all = await recentDrops(60);
  if (!all.length) return null;
  const since = Date.now() - 7 * 86400_000;
  const week = all.filter((d) => new Date(d.when).getTime() >= since);
  const chosen = (week.length ? week : all).slice(0, 8);
  const total = chosen.reduce((acc, d) => acc + (d.paidUsd ?? 0), 0);
  const items = chosen.map((d) => ({ emoji: d.fields.combo, ticker: dollar(d.fields.ticker), figure: d.fields.figure, holders: `${d.fields.stats[0]?.value ?? "?"} holder${d.fields.stats[0]?.value === "1" ? "" : "s"}` }));
  const nDrops = week.length || chosen.length;
  return {
    title: week.length ? "airdrops this week" : "recent airdrops",
    items,
    count: `${nDrops} airdrop${nDrops === 1 ? "" : "s"} · ${money(total)} to holders`,
  };
}

export type FillOptions = { metric?: Metric; stat?: Stat; combo?: string; ticker?: string };

export async function fillFor(template: Template, opts: FillOptions = {}): Promise<Partial<Fields[Template]> | null> {
  switch (template) {
    case "leaderboard":
      return leaderboardFill(opts.metric);
    case "pair":
      return pairFill();
    case "open":
      return openFill();
    case "claimed":
      return claimedFill();
    case "bignumber":
      return bignumberFill(opts.stat);
    case "token":
      return tokenFill(opts.combo ?? "", opts.ticker ?? "");
    case "airdrop":
      return airdropFill(opts.combo, opts.ticker);
    case "airdrops":
      return airdropsFill();
    default:
      return null;
  }
}
