import { NextResponse } from "next/server";
import { FOLLOW_LIMITS, applyFollow, getFollow, listFollowers, listFollowing, type FollowRequest } from "@/lib/follows";

export const dynamic = "force-dynamic";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/**
 * GET /api/follows?follower=0x…              → { following: [...] }               who this wallet follows, with rules
 * GET /api/follows?followee=0x…[&follower=]  → { followers, count, mine }          who follows this agent; `mine` is the caller's own follow
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const follower = q.get("follower") ?? "";
  const followee = q.get("followee") ?? "";
  if (follower && !ADDR.test(follower)) return NextResponse.json({ error: "follower must be a 0x address", code: "BAD_INPUT" }, { status: 400 });
  if (followee && !ADDR.test(followee)) return NextResponse.json({ error: "followee must be a 0x address", code: "BAD_INPUT" }, { status: 400 });
  const headers = { "cache-control": "no-store" };
  if (followee) {
    const [f, mine] = await Promise.all([listFollowers(followee), follower ? getFollow(follower, followee) : Promise.resolve(null)]);
    return NextResponse.json({ count: f.count, followers: f.rows, mine, limits: FOLLOW_LIMITS }, { headers });
  }
  if (follower) return NextResponse.json({ following: await listFollowing(follower), limits: FOLLOW_LIMITS }, { headers });
  return NextResponse.json({ error: "pass follower= or followee=", code: "BAD_INPUT" }, { status: 400 });
}

/**
 * POST /api/follows { action: "follow"|"unfollow", follower, followee, rules?, ts, signature }
 * The follower signs (personal_sign) the canonical message from src/lib/follows.ts; the server verifies it and
 * writes the follow with its copy rules. Sending "follow" again with new rules updates them.
 */
export async function POST(req: Request) {
  let body: FollowRequest;
  try {
    body = (await req.json()) as FollowRequest;
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "BAD_JSON" }, { status: 400 });
  }
  const r = await applyFollow(body);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, follow: r.row });
}
