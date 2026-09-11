import { NextResponse } from "next/server";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";

export const dynamic = "force-dynamic";

/**
 * GET /api/resolve?handle=mojidotwtf → { handle, address, mojis: ["🍎", ...] }
 * Resolves an X handle to the wallet that launched under it. Only launchers resolve.
 * GET /api/resolve?list=1 → all launchers with handles, for a picker.
 */
export async function GET(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ error: "no db" }, { status: 500 });
  const url = new URL(req.url);
  const sb = supabaseServer();
  if (url.searchParams.get("list") === "1") {
    const { data } = await sb.from("mojis").select("creator_handle, creator_address, display").eq("network", NETWORK).not("creator_handle", "is", null).not("creator_address", "is", null).order("launched_at", { ascending: false }).limit(500);
    const by = new Map<string, { handle: string; address: string; mojis: string[] }>();
    for (const r of data ?? []) {
      const h = String(r.creator_handle).toLowerCase();
      const e = by.get(h) ?? { handle: String(r.creator_handle), address: String(r.creator_address), mojis: [] };
      e.mojis.push(String(r.display));
      by.set(h, e);
    }
    return NextResponse.json({ launchers: [...by.values()] }, { headers: { "cache-control": "public, s-maxage=60" } });
  }
  const handle = (url.searchParams.get("handle") ?? "").replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return NextResponse.json({ error: "bad handle" }, { status: 400 });
  const { data } = await sb.from("mojis").select("creator_handle, creator_address, display").eq("network", NETWORK).ilike("creator_handle", handle).not("creator_address", "is", null).order("launched_at", { ascending: false });
  if (!data || data.length === 0) return NextResponse.json({ error: `@${handle} hasn't launched a moji` }, { status: 404 });
  return NextResponse.json({ handle: data[0].creator_handle, address: data[0].creator_address, mojis: data.map((r) => r.display) });
}
