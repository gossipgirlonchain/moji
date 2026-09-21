import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { NAME_RULES, clearName, nameFor, resolveName, setName } from "@/lib/agent-names";

export const dynamic = "force-dynamic";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/**
 * GET /api/agents/name?address=0x…  → { address, name }
 * GET /api/agents/name?name=frog     → { address, name } or 404
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const address = q.get("address") ?? "";
  const name = q.get("name") ?? "";
  const headers = { "cache-control": "no-store" };
  if (address) {
    if (!ADDR.test(address)) return NextResponse.json({ error: "address must be a 0x address", code: "BAD_INPUT" }, { status: 400 });
    return NextResponse.json({ address: address.toLowerCase(), name: await nameFor(address), rules: NAME_RULES }, { headers });
  }
  if (name) {
    const a = await resolveName(name);
    if (!a) return NextResponse.json({ error: "no agent with that name", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ address: a, name: name.toLowerCase().replace(/^@/, "") }, { headers });
  }
  return NextResponse.json({ error: "pass address= or name=", code: "BAD_INPUT" }, { status: 400 });
}

/**
 * POST /api/agents/name { address, name, ts, signature }
 * The wallet signs (personal_sign) the canonical message from src/lib/agent-names.ts. `name: ""` clears it.
 */
export async function POST(req: Request) {
  let body: { address: string; name: string; ts: number; signature: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "BAD_JSON" }, { status: 400 });
  }
  const r = await setName(body);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, name: r.name });
}

/** DELETE /api/agents/name?address=0x… (admin cookie) → clears a name. The light-moderation lever. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!ADDR.test(address)) return NextResponse.json({ error: "address must be a 0x address", code: "BAD_INPUT" }, { status: 400 });
  await clearName(address);
  return NextResponse.json({ ok: true });
}
