import "server-only";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import { supabaseServer, hasSupabase } from "./supabase";
import { NETWORK } from "./network";
import { namesFor } from "./agent-names";

/** The rules a follower sets on one follow. The copy engine (not built yet) enforces them; the API only stores them. */
export type FollowRules = {
  copy: boolean;
  maxPerTradeUsd: number;
  maxPerDayUsd: number;
  /** tickers; null = any pair */
  pairs: string[] | null;
  minHolders: number;
};

export type FollowRow = {
  id: string;
  network: string;
  follower: string;
  followee: string;
  copy: boolean;
  max_per_trade_usd: number;
  max_per_day_usd: number;
  pairs: string[] | null;
  min_holders: number;
  created_at: string;
  updated_at: string;
};

export type FollowAction = "follow" | "unfollow";
export type FollowRequest = { action: FollowAction; follower: string; followee: string; rules?: Partial<FollowRules>; ts: number; signature: string };

export const FOLLOW_LIMITS = {
  /** how many agents one wallet can follow */
  maxFollows: 20,
  maxPerTradeUsd: 10_000,
  maxPerDayUsd: 100_000,
  /** a signed message is good for this long */
  signatureWindowMs: 10 * 60 * 1000,
} as const;

export const DEFAULT_RULES: FollowRules = { copy: false, maxPerTradeUsd: 0, maxPerDayUsd: 0, pairs: null, minHolders: 0 };

/** Normalize and bound the rules. Returns a message for the form on bad input. */
export function validateRules(input: Partial<FollowRules> | undefined): { ok: true; rules: FollowRules } | { ok: false; error: string } {
  const r = { ...DEFAULT_RULES, ...(input ?? {}) };
  const num = (v: unknown, name: string, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${name} must be between 0 and ${max.toLocaleString()}`);
    return Math.round(n * 100) / 100;
  };
  try {
    const rules: FollowRules = {
      copy: Boolean(r.copy),
      maxPerTradeUsd: num(r.maxPerTradeUsd, "max per trade", FOLLOW_LIMITS.maxPerTradeUsd),
      maxPerDayUsd: num(r.maxPerDayUsd, "max per day", FOLLOW_LIMITS.maxPerDayUsd),
      pairs: Array.isArray(r.pairs) && r.pairs.length > 0 ? [...new Set(r.pairs.map((p) => String(p).trim().toUpperCase()).filter((p) => /^[A-Z0-9.]{1,12}$/.test(p)))].slice(0, 50) : null,
      minHolders: Math.floor(num(r.minHolders, "min holders", 1_000_000)),
    };
    if (rules.copy && rules.maxPerTradeUsd <= 0) return { ok: false, error: "set a max per trade to copy" };
    return { ok: true, rules };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** What the follower signs. Keys sorted, so any client produces the same bytes. */
export function canonicalFollowMessage(p: { action: FollowAction; follower: string; followee: string; rules: FollowRules; ts: number }): string {
  const body: Record<string, unknown> = { action: p.action, followee: p.followee.toLowerCase(), follower: p.follower.toLowerCase(), rules: p.rules, ts: p.ts };
  const sorted = (o: unknown): unknown => (Array.isArray(o) ? o : o && typeof o === "object" ? Object.fromEntries(Object.keys(o as object).sort().map((k) => [k, sorted((o as Record<string, unknown>)[k])])) : o);
  return `moji follow v1\n${JSON.stringify(sorted(body))}`;
}

/** Wallets that launched a moji: the only things that can be followed. */
async function isLauncher(address: string): Promise<boolean> {
  const { count } = await supabaseServer().from("mojis").select("id", { count: "exact", head: true }).eq("network", NETWORK).ilike("creator_address", address).not("token_address", "is", null);
  return (count ?? 0) > 0;
}

/** Verify the signature and apply a follow, an unfollow or a rules change. */
export async function applyFollow(req: FollowRequest): Promise<{ ok: true; row: FollowRow | null } | { ok: false; error: string; code: string; status: number }> {
  if (!isAddress(req.follower ?? "") || !isAddress(req.followee ?? "")) return { ok: false, error: "follower and followee must be 0x addresses", code: "BAD_INPUT", status: 400 };
  if (req.action !== "follow" && req.action !== "unfollow") return { ok: false, error: "action must be follow or unfollow", code: "BAD_INPUT", status: 400 };
  const follower = req.follower.toLowerCase();
  const followee = req.followee.toLowerCase();
  if (follower === followee) return { ok: false, error: "you cannot follow yourself", code: "BAD_INPUT", status: 400 };
  const ts = Number(req.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > FOLLOW_LIMITS.signatureWindowMs) return { ok: false, error: "ts must be the current time in ms (signature is good for 10 minutes)", code: "STALE_SIGNATURE", status: 400 };
  const v = validateRules(req.rules);
  if (!v.ok) return { ok: false, error: v.error, code: "BAD_RULES", status: 400 };
  const message = canonicalFollowMessage({ action: req.action, follower, followee, rules: v.rules, ts });
  const good = await verifyMessage({ address: req.follower as Address, message, signature: (req.signature ?? "0x") as Hex }).catch(() => false);
  if (!good) return { ok: false, error: "signature does not match the follow message", code: "BAD_SIGNATURE", status: 403 };
  if (!hasSupabase()) return { ok: false, error: "no db", code: "SERVER_MISCONFIGURED", status: 500 };

  const sb = supabaseServer();
  if (req.action === "unfollow") {
    await sb.from("follows").delete().eq("network", NETWORK).eq("follower", follower).eq("followee", followee);
    return { ok: true, row: null };
  }
  if (!(await isLauncher(followee))) return { ok: false, error: "you can only follow a wallet that launched a moji", code: "NOT_A_LAUNCHER", status: 404 };
  const { count } = await sb.from("follows").select("id", { count: "exact", head: true }).eq("network", NETWORK).eq("follower", follower).neq("followee", followee);
  if ((count ?? 0) >= FOLLOW_LIMITS.maxFollows) return { ok: false, error: `you can follow at most ${FOLLOW_LIMITS.maxFollows} agents`, code: "TOO_MANY_FOLLOWS", status: 429 };
  const { data, error } = await sb
    .from("follows")
    .upsert(
      { network: NETWORK, follower, followee, copy: v.rules.copy, max_per_trade_usd: v.rules.maxPerTradeUsd, max_per_day_usd: v.rules.maxPerDayUsd, pairs: v.rules.pairs, min_holders: v.rules.minHolders, signed_message: message, signature: req.signature, updated_at: new Date().toISOString() },
      { onConflict: "network,follower,followee" },
    )
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, code: "DB_ERROR", status: 500 };
  return { ok: true, row: data as FollowRow };
}

export type FollowSide = FollowRow & { name: string | null; moji: { display: string; ticker: string; chainId: number; kind: string | null; handle: string | null } | null };

/** Attach each address's identity moji (its first launch) to the rows. */
async function withMojis(rows: FollowRow[], side: "follower" | "followee"): Promise<FollowSide[]> {
  const addrs = [...new Set(rows.map((r) => r[side]))];
  if (addrs.length === 0) return [];
  const { data } = await supabaseServer().from("mojis").select("display, stock_ticker, chain_id, creator_address, creator_kind, creator_handle, launched_at").eq("network", NETWORK).or(addrs.map((a) => `creator_address.ilike.${a}`).join(",")).not("token_address", "is", null).order("launched_at", { ascending: true });
  const by = new Map<string, FollowSide["moji"]>();
  for (const m of (data ?? []) as { display: string; stock_ticker: string; chain_id: number; creator_address: string; creator_kind: string | null; creator_handle: string | null }[]) {
    const k = m.creator_address.toLowerCase();
    if (!by.has(k)) by.set(k, { display: m.display, ticker: m.stock_ticker, chainId: m.chain_id, kind: m.creator_kind, handle: m.creator_handle });
  }
  const names = await namesFor(addrs);
  return rows.map((r) => ({ ...r, name: names.get(r[side]) ?? null, moji: by.get(r[side]) ?? null }));
}

export async function listFollowing(follower: string): Promise<FollowSide[]> {
  if (!hasSupabase()) return [];
  const { data } = await supabaseServer().from("follows").select("*").eq("network", NETWORK).eq("follower", follower.toLowerCase()).order("created_at", { ascending: false });
  return withMojis((data ?? []) as FollowRow[], "followee");
}

export async function listFollowers(followee: string, limit = 50): Promise<{ count: number; rows: FollowSide[] }> {
  if (!hasSupabase()) return { count: 0, rows: [] };
  const { data, count } = await supabaseServer().from("follows").select("*", { count: "exact" }).eq("network", NETWORK).eq("followee", followee.toLowerCase()).order("created_at", { ascending: false }).limit(limit);
  return { count: count ?? 0, rows: await withMojis((data ?? []) as FollowRow[], "follower") };
}

export async function getFollow(follower: string, followee: string): Promise<FollowRow | null> {
  if (!hasSupabase()) return null;
  const { data } = await supabaseServer().from("follows").select("*").eq("network", NETWORK).eq("follower", follower.toLowerCase()).eq("followee", followee.toLowerCase()).maybeSingle();
  return (data as FollowRow) ?? null;
}
