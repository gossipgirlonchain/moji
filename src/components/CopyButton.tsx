"use client";

import { useState } from "react";

export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
      className={`press clay-pill heading shrink-0 px-3 py-1.5 text-[12px] uppercase tracking-[0.1em] ${
        done ? "bg-mint text-white" : "bg-sky-50 text-sky-600"
      }`}
    >
      {done ? "copied" : label}
    </button>
  );
}
