import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { distributable, previewRound, tokenFor, validateRules } from "@/lib/drops/campaigns";
import { dropsFeeBps } from "@/lib/drops/contract";
import type { CampaignRules } from "@/lib/drops/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mojis/[combo]/drops/preview?token=stock&amount=0.5&topN=100&days=7&holdDays=3&minHold=1000&minPayoutUsd=2&split=prorata&capBps=500
 * Runs the round maths on today's holders so the form can show who would be paid and how much.
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const q = u.searchParams;
  const m = await getMoji(decodeCombo(combo), q.get("pair"), Number(q.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const input: Partial<CampaignRules> = {
    token: (q.get("token") as "moji" | "stock") ?? "stock",
    amount: q.get("amount") ?? "0",
    topN: Number(q.get("topN") ?? 100),
    days: Number(q.get("days") ?? 7),
    holdDays: Number(q.get("holdDays") ?? 0),
    minHold: q.get("minHold") ?? "0",
    minPayoutUsd: Number(q.get("minPayoutUsd") ?? 2),
    split: (q.get("split") as "prorata" | "equal") ?? "prorata",
    capBps: Number(q.get("capBps") ?? 500),
    cutHourUtc: Number(q.get("cutHourUtc") ?? 9),
    excluded: (q.get("excluded") ?? "").split(",").filter(Boolean),
  };
  const v = validateRules(m, input);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const r = v.rules;
  const t = tokenFor(m, r.token);
  const amountWei = parseUnits(r.amount, t.decimals);
  const feeBps = dropsFeeBps();
  const pot = distributable(amountWei, r.days, feeBps);
  const res = await previewRound(
    m,
    { token_kind: r.token, token_decimals: t.decimals, top_n: r.topN, hold_days: r.holdDays, min_hold_wei: parseUnits(r.minHold, 18).toString(), min_payout_usd: r.minPayoutUsd, split: r.split, cap_bps: r.capBps, excluded: r.excluded },
    pot,
  );
  const amounts = res.payouts.map((p) => p.amountUsd).sort((a, b) => a - b);
  return NextResponse.json(
    {
      rules: r,
      token: t,
      perRound: formatUnits(pot, t.decimals),
      feeBps,
      feePerRound: formatUnits((pot * BigInt(feeBps)) / 10_000n, t.decimals),
      tokenPriceUsd: res.tokenPriceUsd,
      eligible: res.eligible,
      paid: res.payouts.length,
      belowFloor: res.belowFloor,
      thresholdMoji: res.thresholdWei != null ? formatUnits(res.thresholdWei, 18) : null,
      medianUsd: amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0,
      minUsd: amounts[0] ?? 0,
      maxUsd: amounts[amounts.length - 1] ?? 0,
      top: res.payouts.slice(0, 10).map((p) => ({ address: p.address, rank: p.rank, held: formatUnits(p.heldWei, 18), amount: formatUnits(p.amountWei, t.decimals), usd: p.amountUsd })),
      holdersScannedAt: m.holders_scanned_at ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
