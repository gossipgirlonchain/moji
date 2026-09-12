"use client";

import { CHAINS, type MojiChain } from "@/config/chains";
import { chainLaunchable } from "@/lib/numeraire";

export function ChainPills({ value, onChange }: { value: MojiChain; onChange: (c: MojiChain) => void }) {
  return (
    <div className="scroll-x -mx-5 flex gap-2.5 px-5 pb-1">
      {CHAINS.map((c) => {
        const soon = !chainLaunchable(c);
        const active = c.key === value.key;
        return (
          <button
            key={c.key}
            type="button"
            disabled={soon}
            onClick={() => onChange(c)}
            data-pressed={active ? "true" : undefined}
            className={`press clay-pill heading flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-[14px] ${
              active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"
            } ${soon ? "opacity-55" : ""}`}
          >
            <span>{c.emoji}</span>
            <span>{c.short}</span>
            {soon && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-ink-soft">soon</span>}
          </button>
        );
      })}
    </div>
  );
}
