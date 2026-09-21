"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * The <img> half of MojiArt. A meme that fails to load (deleted file, offline) swaps to the emoji fallback,
 * so a moji never renders as a broken or blank box.
 */
export function MemeFace({ src, fallback, eager, className, style, children }: { src: string; fallback: ReactNode; eager?: boolean; className: string; style: CSSProperties; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <span className={className} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} className="block h-full w-full object-cover" />
      {children}
    </span>
  );
}
