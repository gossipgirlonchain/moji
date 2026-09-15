import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { dropsEnabled } from "@/lib/drops/gate";
import { previewDrop, tokenFor, validateRules } from "@/lib/drops/drops";
import { dropsFeeBps, feeFor } from "@/lib/drops/contract";
import type { DropRules } from "@/lib/drops/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mojis/[combo]/drops/preview?token=stock&amount=0.5&topN=100&holdDays=3&minHold=1000&minPayoutUsd=2&split=prorata&capBps=500
 * Runs the ranking on today's holders so the form shows who would be paid and how much, plus the fee.
 */
export async function GET(req: Request, ctx: { params: Promise<{ combo: string }> }) {
  const { combo } = await ctx.params;
  const u = new URL(req.url);
  const q = u.searchParams;
  const m = await getMoji(decodeCombo(combo), q.get("pair"), Number(q.get("chain") ?? 0) || null);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await dropsEnabled(m))) return NextResponse.json({ error: "not available" }, { status: 404 });
  const input: Partial<DropRules> = {
    token: (q.get("token") as "moji" | "stock") ?? "stock",
    amount: q.get("amount") ?? "0",
    topN: Number(q.get("topN") ?? 100),
    holdDays: Number(q.get("holdDays") ?? 0),
    minHold: q.get("minHold") ?? "0",
    minPayoutUsd: Number(q.get("minPayoutUsd") ?? 2),
    split: (q.get("split") as "prorata" | "equal") ?? "prorata",
    capBps: Number(q.get("capBps") ?? 500),
    excluded: (q.get("excluded") ?? "").split(",").filter(Boolean),
  };
  const v = validateRules(m, input);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (!m.holders_scanned_at) return NextResponse.json({ scanning: true, holdersScannedAt: null }, { headers: { "cache-control": "no-store" } });
  const r = v.rules;
  const t = tokenFor(m, r.token);
  const { res } = await previewDrop(m, r);
  const feeBps = dropsFeeBps();
  const feeWei = feeFor(res.paidWei, feeBps);
  const amounts = res.payouts.map((p) => p.amountUsd).sort((a, b) => a - b);
  return NextResponse.json(
    {
      rules: r,
      token: t,
      toHolders: formatUnits(res.paidWei, t.decimals),
      feeBps,
      fee: formatUnits(feeWei, t.decimals),
      total: formatUnits(res.paidWei + feeWei, t.decimals),
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
