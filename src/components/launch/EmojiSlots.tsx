"use client";

import dynamic from "next/dynamic";
import data from "@emoji-mart/data";
import { MAX_EMOJI } from "@/lib/emoji";

const Picker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

type EmojiPick = { native: string };

export function EmojiSlots({ emoji, onChange }: { emoji: string[]; onChange: (next: string[]) => void }) {
  const full = emoji.length >= MAX_EMOJI;
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
      <div className={full ? "pointer-events-none opacity-50" : ""}>
        <Picker
          data={data}
          onEmojiSelect={(e: EmojiPick) => {
            if (emoji.length >= MAX_EMOJI) return;
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
