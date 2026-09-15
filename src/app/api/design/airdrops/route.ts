import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { recentDrops } from "@/lib/social";

export const dynamic = "force-dynamic";

/** GET /api/design/airdrops (admin cookie) -> recent airdrops that paid holders, newest first, each as ready airdrop card fields. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ airdrops: await recentDrops(30) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
