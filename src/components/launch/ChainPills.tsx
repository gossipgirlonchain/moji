"use client";

import { CHAINS, type MojiChain } from "@/config/chains";
import { chainLaunchable } from "@/lib/numeraire";

export function ChainPills({ value, onChange }: { value: MojiChain; onChange: (c: MojiChain) => void }) {
  // Two rows: Robinhood, Base, Ethereum on top; the rest (BNB, Arbitrum, Monad, Solana) share the second row. Emoji hidden on narrow phones so nothing wraps.
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
        className={`press clay-pill heading flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 text-[12.5px] ${
          active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"
        } ${soon ? "opacity-55" : ""}`}
      >
        <span className="hidden min-[400px]:inline">{c.emoji}</span>
        <span>{c.short}</span>
        {soon && <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-ink-soft">soon</span>}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-1.5">{top.map(pill)}</div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(rest.length, 1)}, minmax(0, 1fr))` }}>
        {rest.map(pill)}
      </div>
    </div>
  );
}
