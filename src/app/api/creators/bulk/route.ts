import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { applyPatch, CREATOR_COLUMNS, guard, logEvent } from "@/lib/creators-server";
import { cleanPatch, EVENT_KINDS, type CreatorRow, type EventKind } from "@/lib/creators";

export const dynamic = "force-dynamic";

/**
 * POST /api/creators/bulk (admin) → apply one patch to many creators, optionally logging the same event on each.
 * Body: { ids: string[], patch?: Patch, event?: { kind, body? } }
 */
export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { ids?: unknown; patch?: unknown; event?: { kind?: string; body?: string } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  let patch;
  try {
    patch = body.patch ? cleanPatch(body.patch) : {};
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad patch" }, { status: 400 });
  }
  const evKind = body.event?.kind as EventKind | undefined;
  if (evKind && (!EVENT_KINDS.includes(evKind) || evKind === "stage")) return NextResponse.json({ error: "bad event kind" }, { status: 400 });
  const evBody = (body.event?.body ?? "").toString().trim().slice(0, 4000) || null;

  const { data, error } = await supabaseServer().from("creators").select(CREATOR_COLUMNS).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out: CreatorRow[] = [];
  try {
    for (const row of (data ?? []) as CreatorRow[]) {
      if (evKind) await logEvent(row.id, evKind, evBody);
      const p = { ...patch };
      // Bulk "mark reached out" on rows that already moved further should not drag them back.
      if (evKind && (evKind === "dm_x" || evKind === "dm_telegram") && !p.stage && row.stage === "new") p.stage = "reached_out";
      out.push(Object.keys(p).length ? await applyPatch(row, p) : row);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed", creators: out }, { status: 500 });
  }
  return NextResponse.json({ creators: out });
}
