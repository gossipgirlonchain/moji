"use client";

import { useState } from "react";
import type { CurveDefaults } from "@/config/curve";

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-ink-soft">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="clay-input num w-[140px] py-2 text-right text-[14px]"
      />
    </label>
  );
}

export function Advanced({ value, onChange }: { value: CurveDefaults; onChange: (v: CurveDefaults) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="heading mx-auto block text-[13px] text-ink-soft">
        {open ? "hide advanced" : "advanced"}
      </button>
      {open && (
        <div className="pop mt-3 flex flex-col gap-2.5">
          <Field label="Market cap start ($)" value={value.mcapStart} onChange={(n) => onChange({ ...value, mcapStart: n })} step={100} />
          <Field label="Market cap end ($)" value={value.mcapEnd} onChange={(n) => onChange({ ...value, mcapEnd: n })} step={1000} />
          <Field label="Tail curve share (0 to 1)" value={value.tailShare} onChange={(n) => onChange({ ...value, tailShare: Math.min(0.9, Math.max(0.01, n)) })} step={0.05} />
          <p className="text-[12px] text-ink-soft">
            Supply {value.supply.toLocaleString()}, {Math.round(value.sellFraction * 100)}% sold on the curve, swap fee 3% decaying to 1% over the first hour. 70% of fees stream to you.
          </p>
        </div>
      )}
    </div>
  );
}
