import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Is this browser logged into the admin (beta) gate? Lets static pages render beta-only UI client-side. */
export async function GET() {
  return NextResponse.json({ ok: await isAdmin() }, { headers: { "cache-control": "no-store" } });
}
