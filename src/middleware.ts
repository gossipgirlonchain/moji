import { NextResponse, type NextRequest } from "next/server";

/**
 * agents.moji.wtf is the agents site: its root is /agents. Every other path (moji pages, API, skill.md) is the
 * same app, so links between the two hosts keep working. Add the domain to the Vercel project and this does the rest.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (host.startsWith("agents.") && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/agents";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
