import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { supabaseServer } from "@/lib/supabase";
import { dropsEnabled } from "@/lib/drops/gate";
import { confirmFunded } from "@/lib/drops/campaigns";
import type { CampaignRow } from "@/lib/drops/types";

export const dynamic = "force-dynamic";

/** POST /api/mojis/[combo]/drops/[id]/funded { txHash } → verifies the escrow receipt and starts the campaign. */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string; id: string }> }) {
  if (!(await dropsEnabled())) return NextResponse.json({ error: "not available" }, { status: 404 });
  const { combo, id } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { txHash?: string };
  if (!body.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) return NextResponse.json({ error: "missing txHash" }, { status: 400 });
  const { data } = await supabaseServer().from("drop_campaigns").select("*").eq("id", id).eq("moji_id", m.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  try {
    const row = await confirmFunded(data as CampaignRow, m, body.txHash as Hex);
    return NextResponse.json({ campaign: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
