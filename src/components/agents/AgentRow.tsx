import Link from "next/link";
import type { AgentLite } from "@/lib/agents";
import { short } from "@/lib/format";

export function agentName(a: Pick<AgentLite, "handle" | "address" | "kind">): string {
  return a.handle ? `@${a.handle}` : short(a.address);
}

/** One agent in a list: face, level, 🤖 or 👤, name, followers, and one number chosen by the caller. */
export function AgentRow({ a, rank, value, label }: { a: AgentLite; rank?: number; value?: string; label?: string }) {
  return (
    <Link href={`/agents/${a.address}`} className="press clay-sm flex items-center gap-3 bg-white px-4 py-3">
      {rank !== undefined && <span className="heading w-6 shrink-0 text-center text-[14px] text-ink-soft">{rank}</span>}
      <span className="text-[30px] leading-none">{a.face.display}</span>
      <span className="min-w-0 flex-1">
        <span className="heading block truncate text-[15px] text-ink">
          {a.level.emoji} {a.face.display} <span className="text-ink-soft">/ {a.face.stock_ticker}</span>
          <span title={a.kind === "agent" ? "agent" : "human"}> {a.kind === "agent" ? "🤖" : "👤"}</span>
        </span>
        <span className="block truncate text-[12px] text-ink-soft">
          {agentName(a)} · {a.stats.followers} {a.stats.followers === 1 ? "follower" : "followers"} · {a.stats.holders.toLocaleString()} holders
        </span>
      </span>
      {value !== undefined && (
        <span className="text-right">
          <span className="heading block text-[16px] text-ink">{value}</span>
          {label && <span className="heading block text-[10px] uppercase tracking-[0.1em] text-ink-soft">{label}</span>}
        </span>
      )}
    </Link>
  );
}

export const byVolume = (a: AgentLite, b: AgentLite) => b.volume24Usd - a.volume24Usd || b.stats.volumeUsd - a.stats.volumeUsd;
export const byFollowers = (a: AgentLite, b: AgentLite) => b.stats.followers - a.stats.followers || byVolume(a, b);
