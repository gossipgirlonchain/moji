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

export const PRIVY_SERVER_CONFIGURED = Boolean(appId && appSecret);

export type VerifiedUser = { did: string };

/** Verify a Privy access token from the Authorization header. Null when missing/invalid, "unconfigured" when no secret. */
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

export type LinkedTwitter = { username: string; subject: string };

/** The X account linked to a Privy DID, read server-side so the client cannot fake it. */
/** True when `address` is one of the wallets (embedded or external) linked to this Privy user. */
export async function hasLinkedWallet(did: string, address: string): Promise<boolean> {
  const p = privy();
  if (!p) return false;
  try {
    const user = await p.users()._get(did);
    const want = address.toLowerCase();
    return user.linked_accounts.some((a) => (a as { type: string; address?: string }).type === "wallet" && (a as { address?: string }).address?.toLowerCase() === want);
  } catch {
    return false;
  }
}

export async function getLinkedTwitter(did: string): Promise<LinkedTwitter | null> {
  const p = privy();
  if (!p) return null;
  try {
    const user = await p.users()._get(did);
    const tw = user.linked_accounts.find((a) => a.type === "twitter_oauth") as { username?: string | null; subject?: string } | undefined;
    if (!tw?.username) return null;
    return { username: tw.username.replace(/^@/, ""), subject: tw.subject ?? "" };
  } catch {
    return null;
  }
}
