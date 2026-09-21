"use client";

import { useEffect, useId, useState } from "react";
import { prepareMeme } from "@/lib/meme-client";

/**
 * Pick a picture from the device and preview it. No upload here: the caller gets the (downsized) File and
 * sends it when it has somewhere to put it (after the launch is recorded, or straight away on a moji page).
 */
export function MemePicker({
  value,
  previewUrl,
  onChange,
  busy,
  label = "add a meme",
  changeLabel = "change meme",
  className = "",
}: {
  value: File | null;
  /** an already-stored meme to show while no new file is picked */
  previewUrl?: string | null;
  onChange: (file: File | null) => void;
  busy?: boolean;
  label?: string;
  changeLabel?: string;
  className?: string;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!value) {
      setLocal(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  const shown = local ?? previewUrl ?? null;

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    try {
      onChange(await prepareMeme(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that picture");
    }
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {shown && (
        <span className="clay-sm relative block aspect-square w-full max-w-[240px] overflow-hidden bg-sky-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" className="block h-full w-full object-cover" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={id} className={`press clay-pill heading cursor-pointer px-4 py-2 text-[14px] ${shown ? "bg-white text-ink" : "bg-sky-500 text-white"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "…" : shown ? changeLabel : `${label} 🖼️`}
        </label>
        <input id={id} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} onClick={(e) => ((e.target as HTMLInputElement).value = "")} />
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} className="press clay-pill heading bg-white px-3 py-2 text-[13px] text-ink-soft">
            remove
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-coral">{error}</p>}
    </div>
  );
}
