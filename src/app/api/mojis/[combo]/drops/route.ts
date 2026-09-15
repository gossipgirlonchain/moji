import { NextResponse } from "next/server";
import { isAddress, type Address, type Hex } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { createDraft, listCampaigns, listRounds, payoutsFor, validateRules, operatorConfigured } from "@/lib/drops/campaigns";
import { dropsContract } from "@/lib/drops/contract";
import type { CampaignRules } from "@/lib/drops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/mojis/[combo]/drops?chain&pair&address=0x…
 * Public view: campaigns, recent rounds, and (with address) what that wallet has received.
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  if (!(await dropsEnabled())) return NextResponse.json({ error: "not available" }, { status: 404 });
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const address = u.searchParams.get("address") ?? "";
  const [campaigns, rounds, mine] = await Promise.all([listCampaigns(m.id), listRounds(m.id), isAddress(address) ? payoutsFor(m.id, address) : Promise.resolve([])]);
  return NextResponse.json(
    { campaigns, rounds, mine, escrow: dropsContract(m.chain_id), operator: operatorConfigured(), creator: m.creator_address, mojiId: m.id, priceUsd: Number(m.price_usd ?? 0), holders: m.holders_count ?? 0 },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * POST /api/mojis/[combo]/drops  { rules, signature, signer }
 * Creates a draft campaign from rules signed by the creator wallet. Money moves only when the creator
 * funds the escrow; POST …/drops/[id]/funded confirms that from the receipt.
 */
export async function POST(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  if (!(await dropsEnabled())) return NextResponse.json({ error: "not available" }, { status: 404 });
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const m = await getMoji(decodeCombo(combo), u.searchParams.get("pair"), Number(u.searchParams.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  let body: { rules?: Partial<CampaignRules>; signature?: string; signer?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const v = validateRules(m, body.rules ?? {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (!body.signature || !/^0x[0-9a-fA-F]+$/.test(body.signature) || !body.signer || !isAddress(body.signer)) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  // the client signs exactly what the server validated; any drift between the two means a stale form
  const submitted = body.rules as CampaignRules;
  for (const k of Object.keys(v.rules) as (keyof CampaignRules)[]) {
    const a = JSON.stringify(v.rules[k]);
    const b = JSON.stringify(submitted[k]);
    if (a !== b) return NextResponse.json({ error: `rules changed after signing (${k}); reload and try again` }, { status: 400 });
  }
  try {
    const row = await createDraft(m, v.rules, body.signature as Hex, body.signer as Address);
    return NextResponse.json({ campaign: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
