import { NextResponse } from "next/server";
import { verifyMessage, type Address, type Hex } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { cancelDrop, getDrop } from "@/lib/drops/drops";

export const dynamic = "force-dynamic";

/** POST /api/mojis/[combo]/drops/[id]/cancel { signature, signer } — the creator signs "cancel drop <id>". What was sent stays recorded. */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string; id: string }> }) {
  const { combo, id } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { signature?: string; signer?: string };
  const drop = await getDrop(id, m.id);
  if (!drop) return NextResponse.json({ error: "drop not found" }, { status: 404 });
  if (!body.signature || !body.signer || body.signer.toLowerCase() !== drop.creator_address.toLowerCase()) return NextResponse.json({ error: "only the creator can cancel" }, { status: 403 });
  const ok = await verifyMessage({ address: body.signer as Address, message: `cancel drop ${drop.id}`, signature: body.signature as Hex }).catch(() => false);
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 403 });
  return NextResponse.json({ drop: await cancelDrop(drop) });
}
