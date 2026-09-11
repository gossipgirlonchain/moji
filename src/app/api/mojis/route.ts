import { NextResponse } from "next/server";
import { listMojis, type SortKey } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = (searchParams.get("sort") ?? "newest") as SortKey;
  const q = searchParams.get("q") ?? undefined;
  const rows = await listMojis({ sort, q });
  return NextResponse.json({ mojis: rows });
}
