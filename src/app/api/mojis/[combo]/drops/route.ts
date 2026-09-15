import { NextResponse } from "next/server";
import { isAddress, type Address, type Hex } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { createDrop, listDrops, listPayouts, payoutsFor, validateRules } from "@/lib/drops/drops";
import { dropsFeeBps, dropsFeeRecipient } from "@/lib/drops/contract";
import type { DropRules } from "@/lib/drops/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mojis/[combo]/drops?chain&pair&address=0x…
 * Public view: recent drops, the payouts of the latest one, and (with address) what that wallet received.
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const address = u.searchParams.get("address") ?? "";
  const drops = await listDrops(m.id);
  const latest = drops.find((d) => d.status !== "cancelled");
  const [payouts, mine] = await Promise.all([latest ? listPayouts(latest.id) : Promise.resolve([]), isAddress(address) ? payoutsFor(m.id, address) : Promise.resolve([])]);
  return NextResponse.json(
    { drops, latestPayouts: payouts, mine, creator: m.creator_address, mojiId: m.id, feeBps: dropsFeeBps(), feeRecipient: dropsFeeRecipient(), holders: m.holders_count ?? 0 },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * POST /api/mojis/[combo]/drops  { rules, signature, signer }
 * Cuts a drop from rules signed by the creator wallet: ranks holders now and stores one payout per
 * recipient. The creator then sends the transfers; POST …/drops/[id]/sent confirms them from receipts.
 */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  let body: { rules?: Partial<DropRules>; signature?: string; signer?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const v = validateRules(m, body.rules ?? {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (!body.signature || !/^0x[0-9a-fA-F]+$/.test(body.signature) || !body.signer || !isAddress(body.signer)) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const submitted = body.rules as DropRules;
  for (const k of Object.keys(v.rules) as (keyof DropRules)[]) {
    if (JSON.stringify(v.rules[k]) !== JSON.stringify(submitted[k])) return NextResponse.json({ error: `rules changed after signing (${k}); reload and try again` }, { status: 400 });
  }
  try {
    const out = await createDrop(m, v.rules, body.signature as Hex, body.signer as Address);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
