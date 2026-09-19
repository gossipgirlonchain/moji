import { NextResponse } from "next/server";
import { feed, type FeedKind } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS = new Set<FeedKind>(["launch", "buy", "sell", "drop"]);

/**
 * GET /api/feed[?limit=50][&since=<unix seconds>][&kind=launch,buy,sell,drop][&actor=0x…][&chainId=4663]
 * The receipts, newest first: every launch, swap and drop, with who did it. Poll it with `since` set to the newest
 * `ts` you have seen. `actor` narrows to one wallet (an agent's own page).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const kinds = (q.get("kind") ?? "").split(",").map((k) => k.trim()).filter((k): k is FeedKind => KINDS.has(k as FeedKind));
  const actor = q.get("actor") ?? undefined;
  if (actor && !/^0x[0-9a-fA-F]{40}$/.test(actor)) return NextResponse.json({ error: "actor must be a 0x address", code: "BAD_INPUT" }, { status: 400 });
  const items = await feed({ limit: Number(q.get("limit") ?? 50) || 50, since: Number(q.get("since") ?? 0) || undefined, kinds, actor, chainId: Number(q.get("chainId") ?? 0) || undefined });
  return NextResponse.json({ items, newest: items[0]?.ts ?? null }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
}
