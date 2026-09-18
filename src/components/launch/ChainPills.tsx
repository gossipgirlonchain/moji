"use client";

import { CHAINS, type MojiChain } from "@/config/chains";
import { chainLaunchable } from "@/lib/numeraire";

export function ChainPills({ value, onChange }: { value: MojiChain; onChange: (c: MojiChain) => void }) {
  // One wrapping row: every pill is as wide as its label (plus the "soon" tag) with the same padding, then
  // grows to fill its line, so nothing overflows at any width. Emoji hidden on narrow phones to save room.
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
        className={`press clay-pill heading flex grow items-center justify-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-[12.5px] ${
          active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"
        } ${soon ? "opacity-55" : ""}`}
      >
        <span className="hidden min-[400px]:inline">{c.emoji}</span>
        <span>{c.short}</span>
        {soon && <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-ink-soft">soon</span>}
      </button>
    );
  };
  return <div className="flex flex-wrap gap-2">{CHAINS.map(pill)}</div>;
}
