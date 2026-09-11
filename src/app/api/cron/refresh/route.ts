import { NextResponse } from "next/server";
import { refreshSnapshots } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel cron target (see vercel.json). Protected by CRON_SECRET; Vercel sends it as a Bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now();
  const res = await refreshSnapshots();
  return NextResponse.json({ ...res, ms: Date.now() - t0 });
}
