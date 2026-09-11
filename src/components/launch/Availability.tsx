"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type CheckResult = {
  valid: boolean;
  reason?: string;
  normalized?: string;
  claimed: boolean;
  owner?: { display: string; href: string };
  suggestions: string[];
};

/** Live availability, debounced 200ms. */
export function useAvailability(combo: string) {
  const [state, setState] = useState<{ loading: boolean; result: CheckResult | null }>({ loading: false, result: null });
  useEffect(() => {
    if (!combo) {
      setState({ loading: false, result: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/claims/check?combo=${encodeURIComponent(combo)}`, { cache: "no-store" });
        const j = (await r.json()) as CheckResult;
        if (alive) setState({ loading: false, result: j });
      } catch {
        if (alive) setState({ loading: false, result: null });
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [combo]);
  return state;
}

export function AvailabilityLine({
  combo,
  loading,
  result,
  onPick,
}: {
  combo: string;
  loading: boolean;
  result: CheckResult | null;
  onPick: (combo: string) => void;
}) {
  if (!combo) return <p className="heading text-center text-[15px] text-ink-soft">pick 1 to 3 emoji</p>;
  if (loading || !result) return <p className="heading text-center text-[15px] text-ink-soft">checking…</p>;
  if (!result.valid) return <p className="heading text-center text-[15px] text-coral">{result.reason}</p>;
  if (!result.claimed) {
    return (
      <p className="heading text-center text-[18px] uppercase tracking-[0.12em] text-mint">
        <span className="mr-1">●</span> available
      </p>
    );
  }
  return (
    <div className="text-center">
      <p className="heading text-[18px] uppercase tracking-[0.12em] text-coral">
        <span className="mr-1">●</span> claimed
      </p>
      {result.owner && (
        <Link href={result.owner.href} className="heading text-[13px] text-sky-600 underline underline-offset-4">
          see {result.owner.display}
        </Link>
      )}
      {result.suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[13px] text-ink-soft">these are open</p>
          <div className="flex justify-center gap-2">
            {result.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onPick(s)} className="press clay-sm bg-white px-3 py-2 text-[22px] leading-none">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
