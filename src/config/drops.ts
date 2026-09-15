/**
 * Pairs whose drops are open while the feature is in testing. One entry is one exact pair on one chain,
 * written `combo/TICKER@chainId`. Everything else needs the admin password.
 * `NEXT_PUBLIC_DROPS_ALLOWLIST` (comma-separated, same format) extends the list without a code change.
 */
export const DROPS_ALLOWLIST: string[] = ["🍎/AAPL@4663", ...(process.env.NEXT_PUBLIC_DROPS_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean)];

export function parseAllowlistEntry(e: string): { combo: string; ticker: string; chainId: number } | null {
  const m = /^(.+?)\/([A-Za-z0-9.]+)@(\d+)$/.exec(e.trim());
  return m ? { combo: m[1], ticker: m[2].toUpperCase(), chainId: Number(m[3]) } : null;
}
