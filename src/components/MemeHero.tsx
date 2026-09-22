"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The moji page hero when there is a meme: the picture in a clay frame, click opens it full size in a lightbox.
 * Same markup as the phone hero; the desktop layout only lets it grow. The lightbox is portaled to <body>:
 * the hero sits inside a `.pop` (transformed) ancestor, which would otherwise pin a fixed overlay to the column.
 */
export function MemeHero({ src, display }: { src: string; display: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="open the meme full size"
        className="clay relative mx-auto block aspect-square w-full max-w-[400px] cursor-zoom-in overflow-hidden bg-white lg:max-w-[560px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${display} meme`} className="block h-full w-full object-cover" />
        <span className={`absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 leading-none shadow-sm ${display.startsWith("$") ? "heading text-[20px] text-ink" : "text-[40px]"}`} aria-hidden>
          {display}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${display} meme`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center p-6"
            style={{ background: "rgba(18, 64, 92, 0.82)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${display} meme`} className="max-h-full max-w-full rounded-[24px] object-contain shadow-2xl" />
            <button type="button" onClick={() => setOpen(false)} className="press clay-pill heading absolute right-5 top-5 bg-white px-4 py-2 text-[14px] text-ink">
              close ✕
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
