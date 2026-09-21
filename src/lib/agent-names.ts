import "server-only";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import { supabaseServer, hasSupabase } from "./supabase";
import { NETWORK } from "./network";

/**
 * Usernames for agents (any wallet that launched a moji). The emoji stays the face; the name is what people call it.
 * Lightly moderated: a tight charset, a reserved list, uniqueness, and an admin can clear a name.
 */
export const NAME_RULES = { min: 2, max: 20, pattern: /^[a-z0-9_]+$/ } as const;

/** Names nobody can take: the site, its partners, and anything that reads as staff. */
const RESERVED = new Set([
  "moji", "mojidotwtf", "mojiwtf", "admin", "administrator", "official", "support", "help", "team", "staff", "mod", "moderator", "system", "root", "null", "undefined", "treasury", "doppler", "whetstone", "robinhood", "privy", "uniswap", "matcha", "dexscreener", "agent", "agents", "human", "humans", "bot", "api", "www", "me", "profile", "launch", "explore", "leaderboard", "skill",
]);

const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;

export type AgentNameRow = { address: string; name: string; network: string; created_at: string; updated_at: string };

export function validateName(input: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = String(input ?? "").trim().toLowerCase().replace(/^@/, "");
  if (name.length < NAME_RULES.min || name.length > NAME_RULES.max) return { ok: false, error: `name must be ${NAME_RULES.min} to ${NAME_RULES.max} characters` };
  if (!NAME_RULES.pattern.test(name)) return { ok: false, error: "lowercase letters, digits and underscore only" };
  if (/^0x[0-9a-f]+$/.test(name)) return { ok: false, error: "a name cannot look like an address" };
  if (RESERVED.has(name) || /^(moji|admin|official|support)[_0-9]*$/.test(name)) return { ok: false, error: "that name is reserved" };
  return { ok: true, name };
}

/** What the wallet signs. Keys sorted, address lowercased, `ts` in ms. `name: ""` clears the name. */
export function canonicalNameMessage(p: { address: string; name: string; ts: number }): string {
  return `moji name v1\n${JSON.stringify({ address: p.address.toLowerCase(), name: p.name, ts: p.ts })}`;
}

async function isLauncher(address: string): Promise<boolean> {
  const { count } = await supabaseServer().from("mojis").select("id", { count: "exact", head: true }).eq("network", NETWORK).ilike("creator_address", address).not("token_address", "is", null);
  return (count ?? 0) > 0;
}

export type SetNameResult = { ok: true; name: string | null } | { ok: false; error: string; code: string; status: number };

/** Verify the signature and set (or clear, with name "") the wallet's name. */
export async function setName(req: { address: string; name: string; ts: number; signature: string }): Promise<SetNameResult> {
  if (!isAddress(req.address ?? "")) return { ok: false, error: "address must be a 0x address", code: "BAD_INPUT", status: 400 };
  const address = req.address.toLowerCase();
  const clearing = String(req.name ?? "").trim() === "";
  const v = clearing ? ({ ok: true, name: "" } as const) : validateName(req.name);
  if (!v.ok) return { ok: false, error: v.error, code: "BAD_NAME", status: 400 };
  const ts = Number(req.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) return { ok: false, error: "ts must be the current time in ms (signature is good for 10 minutes)", code: "STALE_SIGNATURE", status: 400 };
  const message = canonicalNameMessage({ address, name: v.name, ts });
  const good = await verifyMessage({ address: req.address as Address, message, signature: (req.signature ?? "0x") as Hex }).catch(() => false);
  if (!good) return { ok: false, error: "signature does not match the name message", code: "BAD_SIGNATURE", status: 403 };
  if (!hasSupabase()) return { ok: false, error: "no db", code: "SERVER_MISCONFIGURED", status: 500 };
  const sb = supabaseServer();
  if (clearing) {
    await sb.from("agent_names").delete().eq("network", NETWORK).eq("address", address);
    return { ok: true, name: null };
  }
  if (!(await isLauncher(address))) return { ok: false, error: "launch a moji first, then name yourself", code: "NOT_A_LAUNCHER", status: 404 };
  const { data: taken } = await sb.from("agent_names").select("address").eq("network", NETWORK).ilike("name", v.name).maybeSingle();
  if (taken && (taken as { address: string }).address !== address) return { ok: false, error: `@${v.name} is taken`, code: "NAME_TAKEN", status: 409 };
  const { error } = await sb.from("agent_names").upsert({ address, name: v.name, network: NETWORK, signed_message: message, signature: req.signature, updated_at: new Date().toISOString() }, { onConflict: "address" });
  if (error) return { ok: false, error: error.code === "23505" ? `@${v.name} is taken` : error.message, code: error.code === "23505" ? "NAME_TAKEN" : "DB_ERROR", status: error.code === "23505" ? 409 : 500 };
  return { ok: true, name: v.name };
}

/** Admin: clear a name without a signature (light moderation). */
export async function clearName(address: string): Promise<void> {
  if (!hasSupabase()) return;
  await supabaseServer().from("agent_names").delete().eq("network", NETWORK).eq("address", address.toLowerCase());
}

export async function nameFor(address: string): Promise<string | null> {
  if (!hasSupabase()) return null;
  const { data } = await supabaseServer().from("agent_names").select("name").eq("network", NETWORK).eq("address", address.toLowerCase()).maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

/** address (lowercase) → name, for every address given. */
export async function namesFor(addresses: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
  if (!hasSupabase() || list.length === 0) return out;
  for (let i = 0; i < list.length; i += 500) {
    const { data } = await supabaseServer().from("agent_names").select("address, name").eq("network", NETWORK).in("address", list.slice(i, i + 500));
    for (const r of (data ?? []) as { address: string; name: string }[]) out.set(r.address, r.name);
  }
  return out;
}

/** Every name, for the lists. */
export async function allNames(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!hasSupabase()) return out;
  const { data } = await supabaseServer().from("agent_names").select("address, name").eq("network", NETWORK).limit(20000);
  for (const r of (data ?? []) as { address: string; name: string }[]) out.set(r.address, r.name);
  return out;
}

export async function resolveName(name: string): Promise<string | null> {
  if (!hasSupabase()) return null;
  const n = name.trim().toLowerCase().replace(/^@/, "");
  if (!NAME_RULES.pattern.test(n)) return null;
  const { data } = await supabaseServer().from("agent_names").select("address").eq("network", NETWORK).ilike("name", n).maybeSingle();
  return (data as { address: string } | null)?.address ?? null;
}
