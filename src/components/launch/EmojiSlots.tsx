"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import data from "@emoji-mart/data";
import { MAX_EMOJI, normalizeCombo } from "@/lib/emoji";

const Picker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

type EmojiPick = { native: string };
type EmojiData = { emojis: Record<string, { id: string; name: string; skins: { native: string }[] }> };

/**
 * Natives of every emoji whose single is already claimed. emoji-mart renders each emoji as a button whose
 * aria-label is the emoji itself, in the grid, frequently used, and search results alike. emoji-mart
 * initializes its data once per page and caches its search pool, so the only filter that reaches all
 * three surfaces is a stylesheet in the picker's shadow root keyed on that label.
 */
function claimedNatives(claimed: Set<string>): string[] {
  const out: string[] = [];
  for (const e of Object.values((data as unknown as EmojiData).emojis)) {
    const native = e.skins?.[0]?.native;
    if (native && claimed.has(normalizeCombo(native))) out.push(native);
  }
  return out;
}

const STYLE_ID = "moji-claimed-filter";
function applyFilter(host: HTMLElement | null, names: string[]): boolean {
  const picker = host?.querySelector("em-emoji-picker") as (HTMLElement & { shadowRoot: ShadowRoot | null }) | null;
  const root = picker?.shadowRoot;
  if (!root) return false;
  let style = root.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    root.appendChild(style);
  }
  style.textContent = names.length ? names.map((n) => `button[aria-label="${n.replace(/"/g, '\\"')}"]{display:none!important}`).join("\n") : "";
  return true;
}

export function EmojiSlots({ emoji, onChange }: { emoji: string[]; onChange: (next: string[]) => void }) {
  const full = emoji.length >= MAX_EMOJI;
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/claims/singles", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { combos: string[] }) => alive && setClaimed(new Set(j.combos ?? [])))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The single-emoji filter only matters for the first slot; 2 and 3 combos are their own claims.
  const filterActive = onlyAvailable && emoji.length === 0;
  const names = useMemo(() => (filterActive ? claimedNatives(claimed) : []), [filterActive, claimed]);
  const hostRef = useRef<HTMLDivElement>(null);

  // The picker mounts asynchronously (dynamic import + web component); keep trying until its shadow root exists.
  useEffect(() => {
    let tries = 0;
    let t: ReturnType<typeof setInterval> | null = null;
    const attempt = () => {
      if (applyFilter(hostRef.current, names) || ++tries > 60) {
        if (t) clearInterval(t);
      }
    };
    attempt();
    if (!applyFilter(hostRef.current, names)) t = setInterval(attempt, 150);
    return () => {
      if (t) clearInterval(t);
    };
  }, [names]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-3">
        {Array.from({ length: MAX_EMOJI }).map((_, i) => {
          const e = emoji[i];
          return e ? (
            <button
              key={i}
              type="button"
              onClick={() => onChange(emoji.filter((_, j) => j !== i))}
              className="press clay pop flex h-[88px] w-[88px] items-center justify-center bg-white"
              aria-label={`remove ${e}`}
              title="tap to remove"
            >
              <span className="wobble text-[48px] leading-none" style={{ animationDelay: `${i * 0.4}s` }}>
                {e}
              </span>
            </button>
          ) : (
            <div
              key={i}
              className="flex h-[88px] w-[88px] items-center justify-center bg-sky-100"
              style={{ borderRadius: "var(--r)", boxShadow: "var(--clay-press)" }}
            >
              <span className="heading text-[28px] text-sky-300">+</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setOnlyAvailable((v) => !v)}
        className="clay-sm mb-2 flex w-full items-center justify-between bg-sky-50 px-4 py-2.5"
        aria-pressed={onlyAvailable}
      >
        <span className="text-[14px] text-ink">
          Available single emojis only
          {claimed.size > 0 && <span className="text-ink-soft"> · {claimed.size} taken</span>}
        </span>
        <span
          className="relative inline-block h-[26px] w-[46px] shrink-0 transition-colors duration-200"
          style={{ borderRadius: 999, background: onlyAvailable ? "var(--sky-500)" : "var(--sky-200)", boxShadow: "var(--clay-press)" }}
        >
          <span
            className="absolute top-[3px] h-[20px] w-[20px] bg-white transition-all duration-200"
            style={{ borderRadius: 999, left: onlyAvailable ? 23 : 3, boxShadow: "2px 2px 6px rgba(18,64,92,0.2)" }}
          />
        </span>
      </button>

      <div ref={hostRef} className={full ? "pointer-events-none opacity-50" : ""}>
        <Picker
          data={data}
          onEmojiSelect={(e: EmojiPick) => {
            if (emoji.length >= MAX_EMOJI) return;
            // Belt and braces: a hidden emoji can still be reached by keyboard.
            if (filterActive && claimed.has(normalizeCombo(e.native))) return;
            onChange([...emoji, e.native]);
          }}
          theme="light"
          previewPosition="none"
          skinTonePosition="none"
          navPosition="bottom"
          perLine={8}
          emojiSize={26}
          emojiButtonSize={38}
          maxFrequentRows={1}
          dynamicWidth
        />
      </div>
      {full && <p className="mt-2 text-center text-[13px] text-ink-soft">three is the max. tap a tile to swap one out.</p>}
    </div>
  );
}
