import "server-only";
import { PrivyClient } from "@privy-io/node";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const appSecret = process.env.PRIVY_APP_SECRET ?? "";

let client: PrivyClient | null = null;
function privy(): PrivyClient | null {
  if (!appId || !appSecret) return null;
  if (!client) client = new PrivyClient({ appId, appSecret });
  return client;
}

export type VerifiedUser = { did: string };

/**
 * Verify a Privy access token from the Authorization header.
 * Returns null when Privy is not configured server-side (dev mode) or the token is invalid.
 */
export async function verifyPrivyToken(authHeader: string | null): Promise<VerifiedUser | null | "unconfigured"> {
  const p = privy();
  if (!p) return "unconfigured";
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const claims = await p.utils().auth().verifyAccessToken(token);
    const did = (claims as { user_id?: string; userId?: string }).user_id ?? (claims as { userId?: string }).userId;
    return did ? { did } : null;
  } catch {
    return null;
  }
}
