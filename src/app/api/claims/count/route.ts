import { NextResponse } from "next/server";
import { claimsCount } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ count: await claimsCount() });
}
