import "server-only";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { supabaseServer } from "@/lib/supabase";
import { STAGE_LABEL, stageStamps, type CreatorRow, type EventKind, type Patch, type Stage } from "@/lib/creators";

const SERVICE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Every /api/creators route: admin cookie + service role key, or a JSON error. */
export async function guard(): Promise<NextResponse | null> {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!SERVICE) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set. The creators table is RLS-locked, so the anon key cannot read it." }, { status: 500 });
  return null;
}

export const CREATOR_COLUMNS =
  "id, created_at, updated_at, source, source_id, applied_at, name, x_handle, telegram_handle, telegram_channel, followers, avg_views_30d, audience, best_posts, rates, sol_wallet, evm_wallet, application_notes, stage, priority, starred, owner, tags, deal_usd, reached_out_at, replied_at, agreed_at, posted_at, paid_at, next_follow_up_at, notes";

export async function getCreator(id: string): Promise<CreatorRow | null> {
  const { data, error } = await supabaseServer().from("creators").select(CREATOR_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CreatorRow | null) ?? null;
}

export async function logEvent(creatorId: string, kind: EventKind, body: string | null, meta: Record<string, unknown> = {}) {
  const { data, error } = await supabaseServer().from("creator_events").insert({ creator_id: creatorId, kind, body, meta }).select("id, creator_id, created_at, kind, body, meta").single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Apply a validated patch to one creator. A stage change stamps its first-entry timestamp and writes a
 * 'stage' event so the timeline shows when it moved.
 */
export async function applyPatch(row: CreatorRow, patch: Patch): Promise<CreatorRow> {
  const update: Partial<CreatorRow> = { ...patch };
  const moved = patch.stage && patch.stage !== row.stage ? (patch.stage as Stage) : null;
  if (moved) Object.assign(update, stageStamps(row, moved));
  const { data, error } = await supabaseServer().from("creators").update(update).eq("id", row.id).select(CREATOR_COLUMNS).single();
  if (error) throw new Error(error.message);
  if (moved) await logEvent(row.id, "stage", `${STAGE_LABEL[row.stage]} → ${STAGE_LABEL[moved]}`, { from: row.stage, to: moved });
  return data as CreatorRow;
}
