"use client";

import { useState } from "react";

/** Deterministic sky/ink-band color from the ticker string. */
export function tickerColor(ticker: string): string {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (h % 360);
  return `hsl(${hue} 55% 52%)`;
}

/**
 * Company logo on a white clay circle. If the market has no logo (or it fails to load),
 * a deterministic colored circle with the first two letters of the ticker. Never the chain logo.
 */
export function StockLogo({ ticker, logo, size = 32 }: { ticker: string; logo?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(logo) && !broken;
  return (
    <span
      className="clay-sm flex shrink-0 items-center justify-center overflow-hidden bg-white"
      style={{ width: size, height: size, borderRadius: 999, background: showImg ? "#fff" : tickerColor(ticker) }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={size} height={size} className="object-contain" style={{ width: size * 0.72, height: size * 0.72 }} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="heading text-white" style={{ fontSize: size * 0.4, lineHeight: 1 }}>
          {ticker.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
