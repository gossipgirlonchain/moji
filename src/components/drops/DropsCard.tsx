"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { Label } from "@/components/ui";
import { usd, short } from "@/lib/format";
import { explorerTx } from "@/lib/links";
import type { CampaignRow, PayoutRow, RoundRow } from "@/lib/drops/types";

type View = { campaigns: CampaignRow[]; rounds: RoundRow[]; mine: (PayoutRow & { cut_at?: string })[]; creator: string | null };

function tok(n: string | number, max = 5): string {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "0";
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}

/**
 * Public "Drops" card on the moji page. Renders nothing until the drops API answers (it is gated while
 * drops are in testing), and nothing when the moji has never had a drop.
 */
export function DropsCard({ combo, ticker, chainId, stockAddress, manageHref }: { combo: string; ticker: string; chainId: number; stockAddress: string; manageHref: string }) {
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
  const running = v.campaigns.filter((c) => c.status === "running");
  const past = v.campaigns.filter((c) => c.status === "done" || c.status === "ended");
  if (running.length === 0 && past.length === 0 && !isCreator) return null;

  const lastPaid = v.rounds.find((r) => r.status === "paid");
  const lastCampaign = lastPaid ? v.campaigns.find((c) => c.id === lastPaid.campaign_id) : undefined;
  const mineTotal = v.mine.reduce((s, p) => s + Number(p.amount_usd ?? 0), 0);
  const myLast = v.mine.find((p) => lastPaid && p.round_id === lastPaid.id);

  return (
    <section className="clay pop pop-3 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <Label>Drops 🪂</Label>
          <p className="mt-0.5 text-[13px] text-ink-soft">{running.length ? "holders are being paid" : past.length ? "past drops" : "no drop running"}</p>
        </div>
        {isCreator && (
          <Link href={manageHref} className="press clay-pill heading bg-sky-50 px-3 py-1.5 text-[12px] text-sky-600">
            manage
          </Link>
        )}
      </div>

      {running.map((c) => (
        <div key={c.id} className="clay-sm mt-3 bg-sky-50 px-4 py-3">
          <p className="heading text-[15px] text-ink">
            {tok(c.amount)} {c.token_symbol} to the top {c.top_n} holders over {c.days} days
          </p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            round {c.rounds_paid} of {c.days} · hold {c.hold_days}d{Number(c.min_hold) > 0 ? ` · at least ${tok(c.min_hold, 0)} ${combo}` : ""} · {c.split === "equal" ? "equal shares" : "pro-rata"}
            {c.next_cut_at && <> · next {new Date(c.next_cut_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>}
          </p>
        </div>
      ))}

      {lastPaid && lastCampaign && (
        <p className="mt-3 text-[13px] text-ink">
          last round · {tok(formatUnits(BigInt(lastPaid.paid_wei), lastCampaign.token_decimals))} {lastCampaign.token_symbol} to {lastPaid.recipients} holders
          {lastPaid.tx_hash && (
            <>
              {" · "}
              <a href={explorerTx(chainId, lastPaid.tx_hash)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                tx
              </a>
            </>
          )}
        </p>
      )}

      {address ? (
        v.mine.length > 0 ? (
          <div className="clay-sm mt-3 flex items-baseline justify-between bg-white px-4 py-3">
            <span>
              <span className="num text-[22px] leading-none text-mint">{usd(mineTotal)}</span>
              <span className="ml-2 text-[12px] text-ink-soft">to {short(address)} so far</span>
            </span>
            {myLast && lastCampaign && (
              <span className="text-[12px] text-ink-soft">
                last: {tok(formatUnits(BigInt(myLast.amount_wei), lastCampaign.token_decimals))} {lastCampaign.token_symbol} · rank {myLast.rank}
              </span>
            )}
          </div>
        ) : running.length > 0 ? (
          <p className="mt-3 text-[12px] text-ink-soft">
            you have not been paid yet. hold {running[0].hold_days > 0 ? `for ${running[0].hold_days} days` : "at the cut"}
            {Number(running[0].min_hold) > 0 ? ` with at least ${tok(running[0].min_hold, 0)} ${combo}` : ""} and rank in the top {running[0].top_n}.
          </p>
        ) : null
      ) : (
        running.length > 0 && <p className="mt-3 text-[12px] text-ink-soft">log in to see your share. paid in {running[0].token_symbol === ticker ? `$${ticker}` : combo}, straight to your wallet.</p>
      )}
    </section>
  );
}
