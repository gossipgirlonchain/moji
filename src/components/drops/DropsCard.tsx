"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { Label } from "@/components/ui";
import { usd, dateShort } from "@/lib/format";
import { explorerTx } from "@/lib/links";
import type { DropRow, PayoutRow } from "@/lib/drops/types";

type Mine = PayoutRow & { token_symbol?: string; token_decimals?: number };
type View = { drops: DropRow[]; mine: Mine[]; creator: string | null; badge: boolean; enabled: boolean };

function tok(n: string | number, max = 5): string {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "0";
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}

/** Public "Rewards" card on every moji page: what the creator has dropped to holders, and what this wallet got. */
export function DropsCard({ combo, chainId, stockAddress, manageHref }: { combo: string; ticker?: string; chainId: number; stockAddress: string; manageHref: string }) {
  const { address } = useAccount();
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ chain: String(chainId), pair: stockAddress, ...(address ? { address } : {}) });
    fetch(`/api/mojis/${encodeURIComponent(combo)}/drops?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: View | null) => alive && j && setV(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [combo, chainId, stockAddress, address]);

  if (!v) return null;
  const isCreator = Boolean(address && v.creator && address.toLowerCase() === v.creator.toLowerCase());
  const sent = v.drops.filter((d) => d.sent_count > 0);
  const last = sent[0];
  const totalUsd = sent.reduce((s, d) => s + Number(d.sent_usd ?? 0), 0);
  const mineTotal = v.mine.reduce((s, p) => s + Number(p.amount_usd ?? 0), 0);
  const myLast = v.mine[0];

  return (
    <section className="clay pop pop-3 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <Label>Rewards 🪂</Label>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {last ? `${usd(totalUsd)} · ${sent.length} drop${sent.length === 1 ? "" : "s"}` : "none yet"}
            {v.badge && last && <span className="ml-1 rounded-full bg-mint px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white">on</span>}
          </p>
        </div>
        {isCreator && v.enabled && (
          <Link href={manageHref} className="press clay-pill heading bg-sky-50 px-3 py-1.5 text-[12px] text-sky-600">
            {last ? "drop again" : "start a drop"}
          </Link>
        )}
      </div>

      {last && (
        <div className="clay-sm mt-3 bg-sky-50 px-4 py-3">
          <p className="heading text-[15px] text-ink">
            {tok(formatUnits(BigInt(last.sent_wei), last.token_decimals))} {last.token_symbol} to {last.sent_count} holders
          </p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {dateShort(last.completed_at ?? last.cut_at)} · top {last.top_n}{last.hold_days > 0 ? ` · ${last.hold_days}d hold` : ""}{Number(last.min_hold) > 0 ? ` · ${tok(last.min_hold, 0)}+ ${combo}` : ""}
          </p>
        </div>
      )}

      {address ? (
        v.mine.length > 0 ? (
          <div className="clay-sm mt-3 flex items-baseline justify-between bg-white px-4 py-3">
            <span>
              <span className="num text-[22px] leading-none text-mint">{usd(mineTotal)}</span>
              <span className="ml-2 text-[12px] text-ink-soft">you</span>
            </span>
            {myLast?.tx_hash && (
              <a href={explorerTx(chainId, myLast.tx_hash)} target="_blank" rel="noopener noreferrer" className="text-[12px] text-sky-600">
                {tok(formatUnits(BigInt(myLast.amount_wei), myLast.token_decimals ?? 18))} {myLast.token_symbol} · #{myLast.rank}
              </a>
            )}
          </div>
        ) : last ? (
          <p className="mt-3 text-[12px] text-ink-soft">you: not in the last drop</p>
        ) : null
      ) : (
        last && <p className="mt-3 text-[12px] text-ink-soft">log in to see yours</p>
      )}
    </section>
  );
}
