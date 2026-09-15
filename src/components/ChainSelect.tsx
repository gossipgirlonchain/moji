"use client";

import type { MojiChain } from "@/config/chains";

/** Compact chain filter: one dropdown instead of a row of pills. Renders nothing when only one chain is present. */
export function ChainSelect({ chains, value, onChange, className = "" }: { chains: MojiChain[]; value: number | null; onChange: (c: number | null) => void; className?: string }) {
  if (chains.length < 2) return null;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={`clay-pill heading cursor-pointer appearance-none bg-white px-4 py-1.5 pr-8 text-[13px] text-ink outline-none ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%235A8AA6' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }} aria-label="chain">
      <option value="">all chains</option>
      {chains.map((c) => (
        <option key={c.chainId} value={c.chainId}>
          {c.short}
        </option>
      ))}
    </select>
  );
}
