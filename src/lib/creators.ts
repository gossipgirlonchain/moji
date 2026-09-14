/**
 * Creator pipeline (/creators). Shared types + constants for the API routes and the board.
 * Rows live in public.creators (moji Supabase, service role only). See supabase/creators.sql.
 */

export const STAGES = ["new", "reached_out", "replied", "negotiating", "agreed", "posted", "paid", "declined", "no_response"] as const;
export type Stage = (typeof STAGES)[number];

/** Stages shown as pipeline columns, in order. The two terminal ones are collapsed under the board. */
export const ACTIVE_STAGES: Stage[] = ["new", "reached_out", "replied", "negotiating", "agreed", "posted", "paid"];
export const CLOSED_STAGES: Stage[] = ["declined", "no_response"];

export const STAGE_LABEL: Record<Stage, string> = {
  new: "new",
  reached_out: "reached out",
  replied: "replied",
  negotiating: "negotiating",
  agreed: "agreed",
  posted: "posted",
  paid: "paid",
  declined: "declined",
  no_response: "no response",
};

/** Which timestamp a stage stamps on first entry. */
export const STAGE_STAMP: Partial<Record<Stage, keyof CreatorRow>> = {
  reached_out: "reached_out_at",
  replied: "replied_at",
  agreed: "agreed_at",
  posted: "posted_at",
  paid: "paid_at",
};

export const PRIORITIES = [0, 1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { 0: "none", 1: "low", 2: "medium", 3: "high" };

export const FOLLOWER_BANDS = ["Under 5K", "5K–15K", "15K–50K", "50K–150K", "150K+"] as const;
export const VIEW_BANDS = ["Under 5K", "5K–20K", "20K–75K", "75K–250K", "250K+"] as const;
export function bandRank(band: string | null | undefined, bands: readonly string[]): number {
  const i = bands.indexOf(band ?? "");
  return i < 0 ? -1 : i;
}

export const EVENT_KINDS = ["note", "dm_x", "dm_telegram", "reply", "call", "stage", "deal", "post", "payment"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_LABEL: Record<EventKind, string> = {
  note: "note",
  dm_x: "DM on X",
  dm_telegram: "DM on Telegram",
  reply: "they replied",
  call: "call",
  stage: "stage",
  deal: "deal",
  post: "posted",
  payment: "payment",
};

export type Rates = Partial<Record<"standing_post" | "thread" | "quote_tweet" | "comment" | "retweet" | "video_30s" | "bundle" | "telegram_post" | "pinned_24h_addon", number>>;
export const RATE_LABEL: Record<keyof Rates, string> = {
  standing_post: "post",
  thread: "thread",
  quote_tweet: "quote",
  comment: "comment",
  retweet: "retweet",
  video_30s: "video 30s",
  bundle: "bundle",
  telegram_post: "tg post",
  pinned_24h_addon: "pin 24h",
};

export type CreatorRow = {
  id: string;
  created_at: string;
  updated_at: string;
  source: "ratio" | "manual";
  source_id: string | null;
  applied_at: string | null;
  name: string;
  x_handle: string;
  telegram_handle: string | null;
  telegram_channel: string | null;
  followers: string | null;
  avg_views_30d: string | null;
  audience: string[];
  best_posts: string[];
  rates: Rates;
  sol_wallet: string | null;
  evm_wallet: string | null;
  application_notes: string | null;
  stage: Stage;
  priority: Priority;
  starred: boolean;
  owner: string | null;
  tags: string[];
  deal_usd: number | null;
  reached_out_at: string | null;
  replied_at: string | null;
  agreed_at: string | null;
  posted_at: string | null;
  paid_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
};

export type CreatorEvent = {
  id: number;
  creator_id: string;
  created_at: string;
  kind: EventKind;
  body: string | null;
  meta: Record<string, unknown>;
};

/** Fields the board may PATCH. Everything else is profile data from the application. */
export const EDITABLE = ["stage", "priority", "starred", "owner", "tags", "deal_usd", "next_follow_up_at", "notes", "telegram_handle", "evm_wallet", "sol_wallet", "name"] as const;
export type Patch = Partial<Pick<CreatorRow, (typeof EDITABLE)[number]>>;

/** Strip @ and x.com / t.me prefixes so handles are stored bare. */
export function bareHandle(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(x\.com|twitter\.com|t\.me)\//i, "")
    .split("?")[0]
    .split("/")[0]
    .replace(/^@/, "")
    .trim();
}

/** Validate + normalize a client patch. Throws on bad values so the route can 400. */
export function cleanPatch(input: unknown): Patch {
  if (!input || typeof input !== "object") throw new Error("bad body");
  const b = input as Record<string, unknown>;
  const out: Patch = {};
  if ("stage" in b) {
    if (!STAGES.includes(b.stage as Stage)) throw new Error("bad stage");
    out.stage = b.stage as Stage;
  }
  if ("priority" in b) {
    const p = Number(b.priority);
    if (!PRIORITIES.includes(p as Priority)) throw new Error("bad priority");
    out.priority = p as Priority;
  }
  if ("starred" in b) out.starred = Boolean(b.starred);
  if ("owner" in b) out.owner = str(b.owner, 80);
  if ("name" in b) {
    const n = str(b.name, 120);
    if (!n) throw new Error("name required");
    out.name = n;
  }
  if ("telegram_handle" in b) out.telegram_handle = bareHandle(str(b.telegram_handle, 64)) || null;
  if ("evm_wallet" in b) out.evm_wallet = str(b.evm_wallet, 80);
  if ("sol_wallet" in b) out.sol_wallet = str(b.sol_wallet, 80);
  if ("tags" in b) {
    const t = Array.isArray(b.tags) ? b.tags : String(b.tags ?? "").split(",");
    out.tags = Array.from(new Set(t.map((x) => String(x).trim().toLowerCase()).filter(Boolean))).slice(0, 20);
  }
  if ("deal_usd" in b) {
    if (b.deal_usd === null || b.deal_usd === "") out.deal_usd = null;
    else {
      const n = Number(b.deal_usd);
      if (!isFinite(n) || n < 0) throw new Error("bad deal_usd");
      out.deal_usd = n;
    }
  }
  if ("next_follow_up_at" in b) {
    if (!b.next_follow_up_at) out.next_follow_up_at = null;
    else {
      const d = new Date(String(b.next_follow_up_at));
      if (isNaN(d.getTime())) throw new Error("bad next_follow_up_at");
      out.next_follow_up_at = d.toISOString();
    }
  }
  if ("notes" in b) out.notes = str(b.notes, 8000);
  return out;
}

function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

/** Apply a stage change: stamp the first-entry timestamp, keep everything else. */
export function stageStamps(row: CreatorRow, next: Stage): Partial<CreatorRow> {
  const key = STAGE_STAMP[next];
  if (!key) return {};
  if (row[key]) return {};
  return { [key]: new Date().toISOString() } as Partial<CreatorRow>;
}

export function xUrl(handle: string): string {
  return `https://x.com/${handle}`;
}
export function tgUrl(handle: string | null): string | null {
  return handle ? `https://t.me/${handle}` : null;
}
