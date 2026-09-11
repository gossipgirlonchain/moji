import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_ENABLED, adminToken, checkPassword } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!ADMIN_ENABLED) return NextResponse.json({ error: "ADMIN_PASSWORD not set" }, { status: 500 });
  const { password } = (await req.json()) as { password?: string };
  if (!checkPassword(password ?? "")) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
