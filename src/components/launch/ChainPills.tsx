"use client";

import { CHAINS, type MojiChain } from "@/config/chains";
import { chainLaunchable } from "@/lib/numeraire";

export function ChainPills({ value, onChange }: { value: MojiChain; onChange: (c: MojiChain) => void }) {
  // Two rows, no horizontal scroll: Robinhood, Base, Ethereum on top, the rest underneath.
  const top = CHAINS.filter((c) => ["robinhood", "base", "ethereum"].includes(c.key));
  const rest = CHAINS.filter((c) => !top.includes(c));
  const pill = (c: MojiChain) => {
    const soon = !chainLaunchable(c);
    const tease = c.key === "solana"; // tappable preview even though it isn't launchable
    const active = c.key === value.key;
    return (
      <button
        key={c.key}
        type="button"
        disabled={soon && !tease}
        onClick={() => onChange(c)}
        data-pressed={active ? "true" : undefined}
        className={`press clay-pill heading flex shrink-0 items-center gap-1 px-3 py-2 text-[13px] ${
          active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"
        } ${soon ? "opacity-55" : ""}`}
      >
        <span>{c.emoji}</span>
        <span>{c.short}</span>
        {soon && <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-ink-soft">soon</span>}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">{top.map(pill)}</div>
      <div className="flex flex-wrap gap-2">{rest.map(pill)}</div>
    </div>
  );
}
