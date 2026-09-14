import { supabaseServer } from "@/lib/supabase";
import { CREATOR_COLUMNS, guard } from "@/lib/creators-server";
import { STAGE_LABEL, PRIORITY_LABEL, type CreatorRow } from "@/lib/creators";

export const dynamic = "force-dynamic";

/** GET /api/creators/export (admin) → the whole pipeline as CSV. */
export async function GET() {
  const g = await guard();
  if (g) return g;
  const { data, error } = await supabaseServer().from("creators").select(CREATOR_COLUMNS).order("priority", { ascending: false }).order("name");
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? []) as CreatorRow[];
  const cols = ["name", "x_handle", "x_url", "telegram_handle", "telegram_url", "stage", "priority", "starred", "owner", "tags", "deal_usd", "followers", "avg_views_30d", "audience", "next_follow_up_at", "reached_out_at", "replied_at", "agreed_at", "posted_at", "paid_at", "notes", "application_notes", "sol_wallet", "evm_wallet", "applied_at", "source"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) {
    const v: Record<string, unknown> = { ...r, x_url: `https://x.com/${r.x_handle}`, telegram_url: r.telegram_handle ? `https://t.me/${r.telegram_handle}` : "", stage: STAGE_LABEL[r.stage], priority: PRIORITY_LABEL[r.priority] };
    lines.push(cols.map((c) => esc(v[c])).join(","));
  }
  return new Response("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="moji-creators-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
}
