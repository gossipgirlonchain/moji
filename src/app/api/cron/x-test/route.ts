import { NextResponse } from "next/server";
import { postTweet, X_ENABLED, X_AUTOPOST } from "@/lib/x";

export const dynamic = "force-dynamic";

/** GET /api/cron/x-test?text=hello (CRON_SECRET bearer) → posts once from @mojidotwtf, to prove the keys work. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = new URL(req.url).searchParams.get("text");
  if (!text) return NextResponse.json({ enabled: X_ENABLED, autopost: X_AUTOPOST });
  return NextResponse.json({ enabled: X_ENABLED, autopost: X_AUTOPOST, result: await postTweet(text) });
}
