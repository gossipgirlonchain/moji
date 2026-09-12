import { NextResponse } from "next/server";
import { listMojis, type SortKey, type Window } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = (searchParams.get("sort") ?? "newest") as SortKey;
  const q = searchParams.get("q") ?? undefined;
  const window = (searchParams.get("window") ?? "24h") as Window;
  const rows = await listMojis({ sort, q, window });
  return NextResponse.json({ mojis: rows }, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
