import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Post to X as @mojidotwtf. OAuth 1.0a user context (the only auth X allows for posting on the free tier).
 * Env: X_API_KEY, X_API_SECRET (the app), X_ACCESS_TOKEN, X_ACCESS_SECRET (the @mojidotwtf user), X_AUTOPOST=1 to enable.
 */
export const X_ENABLED = Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET);
export const X_AUTOPOST = X_ENABLED && process.env.X_AUTOPOST === "1";

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function oauthHeader(method: string, url: string): string {
  const key = process.env.X_API_KEY!, secret = process.env.X_API_SECRET!, token = process.env.X_ACCESS_TOKEN!, tokenSecret = process.env.X_ACCESS_SECRET!;
  const params: Record<string, string> = {
    oauth_consumer_key: key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&"))].join("&");
  const sig = createHmac("sha1", `${enc(secret)}&${enc(tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.entries({ ...params, oauth_signature: sig }).sort().map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");
}

export async function postTweet(text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!X_ENABLED) return { ok: false, error: "X keys not set" };
  const url = "https://api.x.com/2/tweets";
  const r = await fetch(url, { method: "POST", headers: { authorization: oauthHeader("POST", url), "content-type": "application/json" }, body: JSON.stringify({ text }) });
  const j = (await r.json().catch(() => ({}))) as { data?: { id: string }; detail?: string; title?: string; errors?: { message: string }[] };
  if (!r.ok || !j.data?.id) return { ok: false, error: j.detail ?? j.title ?? j.errors?.[0]?.message ?? `HTTP ${r.status}` };
  return { ok: true, id: j.data.id };
}

/** The launch announcement. Same shape as the Post it button, from the moji account. */
export function launchTweet(m: { display: string; stock_ticker: string; creator_handle?: string | null; token_address?: string | null }, url: string): string {
  const by = m.creator_handle ? ` by @${m.creator_handle}` : "";
  return `${m.display} paired to ${m.stock_ticker}${by} 🫡\n\nCA: ${m.token_address ?? ""}\n\n${url}`;
}
