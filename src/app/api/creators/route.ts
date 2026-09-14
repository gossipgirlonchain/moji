import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { CREATOR_COLUMNS, guard, logEvent } from "@/lib/creators-server";
import { bareHandle, cleanPatch, FOLLOWER_BANDS, VIEW_BANDS, type CreatorRow } from "@/lib/creators";

export const dynamic = "force-dynamic";

/** GET /api/creators (admin) → every creator, plus the last event per creator for the "last touch" column. */
export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = supabaseServer();
  const [{ data, error }, { data: ev, error: evErr }] = await Promise.all([
    db.from("creators").select(CREATOR_COLUMNS).order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(2000),
    db.from("creator_events").select("creator_id, created_at, kind").order("created_at", { ascending: false }).limit(5000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });
  const last: Record<string, { at: string; kind: string }> = {};
  for (const e of ev ?? []) if (!last[e.creator_id]) last[e.creator_id] = { at: e.created_at, kind: e.kind };
  return NextResponse.json({ creators: (data ?? []) as CreatorRow[], lastEvent: last }, { headers: { "cache-control": "no-store" } });
}

/** POST /api/creators (admin) → add a creator by hand. Body: { name, x_handle, telegram_handle?, followers?, avg_views_30d?, audience?, notes?, priority? } */
export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const x_handle = bareHandle(String(body.x_handle ?? ""));
  const name = String(body.name ?? "").trim() || x_handle;
  if (!x_handle) return NextResponse.json({ error: "x_handle required" }, { status: 400 });
  let patch;
  try {
    patch = cleanPatch({ priority: body.priority ?? 0, notes: body.notes ?? null, telegram_handle: body.telegram_handle ?? null, tags: body.tags ?? [], owner: body.owner ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad body" }, { status: 400 });
  }
  const followers = FOLLOWER_BANDS.includes(body.followers as (typeof FOLLOWER_BANDS)[number]) ? body.followers : null;
  const avg_views_30d = VIEW_BANDS.includes(body.avg_views_30d as (typeof VIEW_BANDS)[number]) ? body.avg_views_30d : null;
  const audience = Array.isArray(body.audience) ? body.audience.map(String).filter(Boolean).slice(0, 10) : [];
  const { data, error } = await supabaseServer()
    .from("creators")
    .insert({ source: "manual", name, x_handle, followers, avg_views_30d, audience, ...patch })
    .select(CREATOR_COLUMNS)
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ error: dup ? `@${x_handle} is already in the pipeline` : error.message }, { status: dup ? 409 : 500 });
  }
  await logEvent((data as CreatorRow).id, "note", "added by hand");
  return NextResponse.json({ creator: data as CreatorRow });
}
