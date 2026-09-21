import "server-only";
import { supabaseServer, hasSupabase, type MojiRow } from "./supabase";
import { NETWORK } from "./network";
import { allNames, nameFor } from "./agent-names";

/**
 * An agent is a wallet that launched a moji. Its first moji is its face. Everything else here is aggregated from
 * receipts: the moji snapshot columns, the follows table and the drops table.
 */
export type AgentStats = { holders: number; volumeUsd: number; feesUsd: number; drops: number; followers: number; days: number };

export type Agent = {
  address: string;
  /** the username the wallet set for itself (src/lib/agent-names.ts), if any */
  name: string | null;
  handle: string | null;
  kind: "x" | "wallet" | "agent";
  /** the identity moji: first launch */
  face: Pick<MojiRow, "display" | "stock_ticker" | "chain_id" | "token_address">;
  mojis: MojiRow[];
  stats: AgentStats;
  firstLaunch: string;
  volume24Usd: number;
  mcapUsd: number;
};

/** What the client lists need: no moji rows. */
export type AgentLite = {
  address: string;
  name: string | null;
  handle: string | null;
  kind: Agent["kind"];
  face: Agent["face"];
  stats: AgentStats;
  firstLaunch: string;
  volume24Usd: number;
  mojiCount: number;
};

export function toLite(a: Agent): AgentLite {
  return { address: a.address, name: a.name, handle: a.handle, kind: a.kind, face: a.face, stats: a.stats, firstLaunch: a.firstLaunch, volume24Usd: a.volume24Usd, mojiCount: a.mojis.length };
}

type Lite = Pick<MojiRow, "id" | "display" | "combo" | "stock_ticker" | "stock_address" | "chain_id" | "token_address" | "pool_id" | "creator_address" | "creator_handle" | "creator_kind" | "launched_at" | "holders_count" | "volume_all_usd" | "volume24_usd" | "market_cap_usd" | "fees_claimed_usd" | "fees_unclaimed_usd" | "fees_total_usd" | "drops_active" | "rewards_badge">;

async function followerCounts(): Promise<Map<string, number>> {
  const { data } = await supabaseServer().from("follows").select("followee").eq("network", NETWORK).limit(20000);
  const by = new Map<string, number>();
  for (const r of (data ?? []) as { followee: string }[]) by.set(r.followee, (by.get(r.followee) ?? 0) + 1);
  return by;
}

async function dropCounts(): Promise<Map<string, number>> {
  const { data } = await supabaseServer().from("drops").select("creator_address").eq("network", NETWORK).gt("sent_count", 0).limit(20000);
  const by = new Map<string, number>();
  for (const r of (data ?? []) as { creator_address: string }[]) by.set(r.creator_address.toLowerCase(), (by.get(r.creator_address.toLowerCase()) ?? 0) + 1);
  return by;
}

function build(rows: Lite[], followers: Map<string, number>, drops: Map<string, number>, names: Map<string, string>): Agent[] {
  const by = new Map<string, Lite[]>();
  for (const m of rows) {
    if (!m.creator_address) continue;
    const k = m.creator_address.toLowerCase();
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  const out: Agent[] = [];
  for (const [address, list] of by) {
    list.sort((a, b) => new Date(a.launched_at).getTime() - new Date(b.launched_at).getTime());
    const face = list[0];
    const fees = (m: Lite) => Number(m.fees_total_usd ?? 0) || Number(m.fees_claimed_usd ?? 0) + Number(m.fees_unclaimed_usd ?? 0);
    const stats: AgentStats = {
      holders: list.reduce((s, m) => s + Number(m.holders_count ?? 0), 0),
      volumeUsd: list.reduce((s, m) => s + Number(m.volume_all_usd ?? 0), 0),
      feesUsd: list.reduce((s, m) => s + fees(m), 0),
      drops: drops.get(address) ?? 0,
      followers: followers.get(address) ?? 0,
      days: Math.floor((Date.now() - new Date(face.launched_at).getTime()) / 86_400_000),
    };
    out.push({
      address,
      name: names.get(address) ?? null,
      handle: face.creator_handle ?? null,
      kind: (face.creator_kind as Agent["kind"]) ?? "x",
      face: { display: face.display, stock_ticker: face.stock_ticker, chain_id: face.chain_id, token_address: face.token_address },
      mojis: list as MojiRow[],
      stats,
      firstLaunch: face.launched_at,
      volume24Usd: list.reduce((s, m) => s + Number(m.volume24_usd ?? 0), 0),
      mcapUsd: list.reduce((s, m) => s + Number(m.market_cap_usd ?? 0), 0),
    });
  }
  return out;
}

const COLS = "id, display, combo, stock_ticker, stock_address, chain_id, token_address, pool_id, creator_address, creator_handle, creator_kind, launched_at, holders_count, volume_all_usd, volume24_usd, market_cap_usd, fees_claimed_usd, fees_unclaimed_usd, fees_total_usd, drops_active, rewards_badge";

/** Every agent (every launcher wallet), unsorted. */
export async function listAgents(): Promise<Agent[]> {
  if (!hasSupabase()) return [];
  const [{ data }, followers, drops, names] = await Promise.all([supabaseServer().from("mojis").select(COLS).eq("network", NETWORK).not("token_address", "is", null).limit(5000), followerCounts(), dropCounts(), allNames()]);
  return build((data ?? []) as Lite[], followers, drops, names);
}

/** One agent by wallet, or null when that wallet never launched. */
export async function getAgent(address: string): Promise<Agent | null> {
  if (!hasSupabase()) return null;
  const sb = supabaseServer();
  const [{ data }, { count }, { count: dcount }, name] = await Promise.all([
    sb.from("mojis").select(COLS).eq("network", NETWORK).ilike("creator_address", address).not("token_address", "is", null),
    sb.from("follows").select("id", { count: "exact", head: true }).eq("network", NETWORK).eq("followee", address.toLowerCase()),
    sb.from("drops").select("id", { count: "exact", head: true }).eq("network", NETWORK).ilike("creator_address", address).gt("sent_count", 0),
    nameFor(address),
  ]);
  const rows = (data ?? []) as Lite[];
  if (rows.length === 0) return null;
  const a = address.toLowerCase();
  return build(rows, new Map([[a, count ?? 0]]), new Map([[a, dcount ?? 0]]), new Map(name ? [[a, name]] : []))[0] ?? null;
}
