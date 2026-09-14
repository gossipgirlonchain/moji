import { NextResponse } from "next/server";
import { applyPatch, getCreator, guard, logEvent } from "@/lib/creators-server";
import { EVENT_KINDS, type EventKind, type Stage } from "@/lib/creators";

export const dynamic = "force-dynamic";

/**
 * POST /api/creators/[id]/events (admin) → log a touchpoint. Body: { kind, body? }.
 * A DM logged on a "new" creator moves them to "reached out"; a reply logged on "new" or "reached out" moves them to "replied".
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  let body: { kind?: string; body?: string };
  try {
    body = (await req.json()) as { kind?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const kind = body.kind as EventKind;
  if (!EVENT_KINDS.includes(kind) || kind === "stage") return NextResponse.json({ error: "bad kind" }, { status: 400 });
  const text = (body.body ?? "").toString().trim().slice(0, 4000) || null;
  try {
    let creator = await getCreator(id);
    if (!creator) return NextResponse.json({ error: "not found" }, { status: 404 });
    const event = await logEvent(id, kind, text);
    let next: Stage | null = null;
    if ((kind === "dm_x" || kind === "dm_telegram") && creator.stage === "new") next = "reached_out";
    if (kind === "reply" && (creator.stage === "new" || creator.stage === "reached_out")) next = "replied";
    if (kind === "post" && !["posted", "paid"].includes(creator.stage)) next = "posted";
    if (kind === "payment" && creator.stage !== "paid") next = "paid";
    if (next) creator = await applyPatch(creator, { stage: next });
    return NextResponse.json({ event, creator });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
