import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { applyPatch, getCreator, guard } from "@/lib/creators-server";
import { cleanPatch, type CreatorEvent } from "@/lib/creators";

export const dynamic = "force-dynamic";

/** GET /api/creators/[id] (admin) → the creator + its full timeline. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  const creator = await getCreator(id).catch((e: Error) => ({ error: e.message }));
  if (!creator) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ("error" in creator) return NextResponse.json({ error: creator.error }, { status: 500 });
  const { data, error } = await supabaseServer().from("creator_events").select("id, creator_id, created_at, kind, body, meta").eq("creator_id", id).order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ creator, events: (data ?? []) as CreatorEvent[] }, { headers: { "cache-control": "no-store" } });
}

/** PATCH /api/creators/[id] (admin) → update pipeline fields. Stage moves are stamped and logged. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  let patch;
  try {
    patch = cleanPatch(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad body" }, { status: 400 });
  }
  try {
    const row = await getCreator(id);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    const creator = await applyPatch(row, patch);
    return NextResponse.json({ creator });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

/** DELETE /api/creators/[id] (admin) → remove a creator and its timeline. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  const row = await getCreator(id).catch(() => null);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { error } = await supabaseServer().from("creators").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
