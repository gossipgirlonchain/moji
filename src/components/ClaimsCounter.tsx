"use client";

import { useEffect, useState } from "react";

export function ClaimsCounter({ initial }: { initial: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = initial;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [initial]);
  return (
    <span className="heading text-ink">
      <span className="num text-[18px]">{n.toLocaleString()}</span> {n === 1 ? "moji" : "mojis"} launched
    </span>
  );
}
