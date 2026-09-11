export function short(addr?: string | null, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, 2 + head)}…${addr.slice(-tail)}`;
}

export function usd(n?: number | null, opts: { compact?: boolean } = { compact: true }): string {
  const v = Number(n ?? 0);
  if (!isFinite(v) || v === 0) return "$0.00";
  if (opts.compact) {
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  }
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function num(n: number | string | bigint | null | undefined): string {
  if (n === null || n === undefined) return "0";
  const v = typeof n === "bigint" ? Number(n) : Number(n);
  if (!isFinite(v)) return String(n);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
}

export function dateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
