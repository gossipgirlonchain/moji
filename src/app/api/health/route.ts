import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { hasSupabase, supabaseServer } from "@/lib/supabase";
import { NETWORK } from "@/lib/network";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Server-side self-check. Uses the Privy app secret stored in the environment to look up the most
 * recent creator by DID, which proves (a) the secret matches the app id and (b) the user exists in that app.
 * Exposes nothing that is not already public on the moji page.
 */
export async function GET() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const secret = process.env.PRIVY_APP_SECRET ?? "";
  const out: Record<string, unknown> = {
    privyAppId: appId ? `${appId.slice(0, 10)}…` : null,
    privySecretSet: Boolean(secret),
    supabase: hasSupabase(),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    treasurySet: Boolean(process.env.NEXT_PUBLIC_MOJI_TREASURY),
    network: NETWORK,
  };
  if (appId && secret && hasSupabase()) {
    const { data } = await supabaseServer().from("mojis").select("display, creator_did, creator_handle").eq("network", NETWORK).not("creator_did", "is", null).order("launched_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.creator_did) {
      try {
        const privy = new PrivyClient({ appId, appSecret: secret });
        const u = await privy.users()._get(data.creator_did);
        const tw = u.linked_accounts.find((a) => a.type === "twitter_oauth") as { username?: string | null } | undefined;
        const wallets = u.linked_accounts.filter((a) => a.type === "wallet").length;
        out.privySecretValid = true;
        out.sampleUser = { moji: data.display, did: `${data.creator_did.slice(0, 20)}…`, x: tw?.username ?? null, linkedWallets: wallets, createdAt: (u as { created_at?: number }).created_at ?? null };
      } catch (e) {
        out.privySecretValid = false;
        out.privyError = (e instanceof Error ? e.message : String(e)).slice(0, 160);
      }
    }
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
