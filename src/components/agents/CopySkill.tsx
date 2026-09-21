"use client";

import { useState } from "react";

/** Copies text to the clipboard and says so for a moment. */
export function CopySkill({ raw, label = "copy skill.md", small }: { raw: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  }
  return (
    <button type="button" onClick={copy} className={`press heading ${small ? "clay-pill bg-sky-50 px-3 py-1 text-[11px] text-ink" : "clay bg-sky-500 px-4 py-2 text-[14px] text-white"}`}>
      {done ? "copied ✓" : label}
    </button>
  );
}
