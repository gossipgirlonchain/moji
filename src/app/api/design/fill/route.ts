import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { isTemplate } from "@/lib/card/params";
import { fillFor } from "@/lib/social";

export const dynamic = "force-dynamic";

/** GET /api/design/fill?template= (admin cookie) -> the template's fields from live data, same queries as the post queue. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const template = new URL(req.url).searchParams.get("template");
  if (!isTemplate(template)) return NextResponse.json({ error: "unknown template" }, { status: 400 });
  try {
    const fields = await fillFor(template);
    if (!fields) return NextResponse.json({ error: `no live data for ${template}` }, { status: 404 });
    return NextResponse.json({ fields });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fill failed" }, { status: 500 });
  }
}
