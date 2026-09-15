import { NextResponse } from "next/server";
import { verifyMessage, type Address, type Hex } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { supabaseServer } from "@/lib/supabase";
import { dropsEnabled } from "@/lib/drops/gate";

export const dynamic = "force-dynamic";

/**
 * POST /api/mojis/[combo]/drops/badge { on, signature, signer }
 * The creator turns the "rewards" badge on or off. Only after at least one drop has been sent.
 * Signed message: `rewards badge <mojiId> on|off`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { on?: boolean; signature?: string; signer?: string };
  if (!m.creator_address || !body.signer || body.signer.toLowerCase() !== m.creator_address.toLowerCase()) return NextResponse.json({ error: "only the creator can do this" }, { status: 403 });
  const on = Boolean(body.on);
  const ok = await verifyMessage({ address: body.signer as Address, message: `rewards badge ${m.id} ${on ? "on" : "off"}`, signature: (body.signature ?? "0x") as Hex }).catch(() => false);
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 403 });
  const sb = supabaseServer();
  if (on) {
    const { count } = await sb.from("drops").select("id", { count: "exact", head: true }).eq("moji_id", m.id).gt("sent_count", 0);
    if (!count) return NextResponse.json({ error: "send a drop first" }, { status: 400 });
  }
  const { error } = await sb.from("mojis").update({ rewards_badge: on }).eq("id", m.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ badge: on });
}
