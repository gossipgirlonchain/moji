import { NextResponse } from "next/server";
import { listMojis, type SortKey } from "@/lib/data";
import { withLiveMcap } from "@/lib/mcap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = (searchParams.get("sort") ?? "newest") as SortKey;
  const q = searchParams.get("q") ?? undefined;
  const rows = await withLiveMcap(await listMojis({ sort, q }));
  if (sort === "mcap") rows.sort((a, b) => Number(b.market_cap_usd ?? 0) - Number(a.market_cap_usd ?? 0));
  return NextResponse.json({ mojis: rows });
}
