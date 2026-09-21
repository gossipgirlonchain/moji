/**
 * The words and links a meme carries: a short description plus X, Telegram and website links.
 * Shared by the browser (forms) and the route (validation), so both normalize the same way.
 */
export type MemeDetails = { description: string; x_url: string; telegram_url: string; website_url: string };

export const DESCRIPTION_MAX = 280;
const URL_MAX = 200;

export const EMPTY_DETAILS: MemeDetails = { description: "", x_url: "", telegram_url: "", website_url: "" };

export function detailsOf(m: { description?: string | null; x_url?: string | null; telegram_url?: string | null; website_url?: string | null }): MemeDetails {
  return { description: m.description ?? "", x_url: m.x_url ?? "", telegram_url: m.telegram_url ?? "", website_url: m.website_url ?? "" };
}

export function hasDetails(d: Partial<MemeDetails> | null | undefined): boolean {
  return Boolean(d && (d.description || d.x_url || d.telegram_url || d.website_url));
}

const HANDLE = /^[a-z0-9_]{1,32}$/i;

/** `@moji`, `moji`, `x.com/moji`, `https://twitter.com/moji` → `https://x.com/moji`. */
function xLink(raw: string): string | null {
  const s = raw.trim().replace(/^@/, "");
  if (!s) return "";
  if (HANDLE.test(s)) return `https://x.com/${s}`;
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([a-z0-9_]{1,32})(?:[/?#].*)?$/i);
  return m ? `https://x.com/${m[1]}` : null;
}

/** `@mojichat`, `t.me/mojichat`, `https://t.me/+invite` → `https://t.me/...`. */
function telegramLink(raw: string): string | null {
  const s = raw.trim().replace(/^@/, "");
  if (!s) return "";
  if (/^[a-z0-9_]{3,64}$/i.test(s)) return `https://t.me/${s}`;
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(\+?[a-z0-9_/-]{1,80})(?:[?#].*)?$/i);
  return m ? `https://t.me/${m[1]}` : null;
}

/** Any http(s) URL; a bare host gets https://. */
function webLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString().length > URL_MAX ? null : u.toString();
  } catch {
    return null;
  }
}

/** Trim, normalize and bound every field. Returns the clean details or the first problem in plain words. */
export function cleanMemeDetails(input: unknown): { ok: true; details: MemeDetails } | { ok: false; error: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (k: keyof MemeDetails) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const description = str("description").replace(/\s+/g, " ").trim();
  if (description.length > DESCRIPTION_MAX) return { ok: false, error: `Descriptions are capped at ${DESCRIPTION_MAX} characters` };
  const x_url = xLink(str("x_url"));
  if (x_url === null) return { ok: false, error: "X link should be a handle or an x.com URL" };
  const telegram_url = telegramLink(str("telegram_url"));
  if (telegram_url === null) return { ok: false, error: "Telegram link should be a handle or a t.me URL" };
  const website_url = webLink(str("website_url"));
  if (website_url === null) return { ok: false, error: "Website should be an http(s) URL" };
  return { ok: true, details: { description, x_url, telegram_url, website_url } };
}
