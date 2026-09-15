import Link from "next/link";
import { notFound } from "next/navigation";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { mojiHref } from "@/components/MojiBits";
import { dropsEnabled } from "@/lib/drops/gate";
import { dropsContract } from "@/lib/drops/contract";
import { findNumeraire } from "@/lib/numeraire";
import { DropsManage } from "@/components/drops/DropsManage";
import { AdminGate } from "@/components/Admin";
import { ADMIN_ENABLED } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "drops · moji", robots: { index: false, follow: false } };

type Params = Promise<{ combo: string; pair?: string[] }>;

/** /drops/🍎/AAPL: the creator's page for one moji: stats and drops. Admin-gated while drops are in testing. */
export default async function DropsPage({ params }: { params: Params }) {
  const { combo, pair } = await params;
  const d = decodeCombo(combo);
  const m = await getMoji(d, pair?.[0] ? decodeURIComponent(pair[0]) : null, Number(pair?.[1] ?? 0) || null);
  if (!m) notFound();
  const ok = await dropsEnabled(m);
  const stock = findNumeraire(m.chain_id, m.stock_address);
  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <Link href={mojiHref(m)} className="wobble inline-block text-[64px] leading-none">
          {m.display}
        </Link>
        <h1 className="mt-2 text-[28px] leading-tight text-ink">
          {m.display} <span className="text-ink-soft">/</span> {m.stock_ticker} <span className="text-ink-soft">· drops</span>
        </h1>
        <p className="heading mt-1 text-[13px] text-ink-soft">give {m.stock_ticker} or {m.display} to the holders who stick around</p>
      </div>
      {!ADMIN_ENABLED ? (
        <p className="text-center text-[14px] text-coral">ADMIN_PASSWORD is not set.</p>
      ) : !ok ? (
        <>
          <p className="text-center text-[13px] text-ink-soft">drops are in testing. enter the admin password to continue.</p>
          <AdminGate />
        </>
      ) : (
        <DropsManage
          combo={m.display}
          ticker={m.stock_ticker}
          chainId={m.chain_id}
          stockAddress={m.stock_address}
          stockDecimals={stock?.decimals ?? 18}
          tokenAddress={m.token_address}
          creatorAddress={m.creator_address}
          mojiId={m.id}
          escrow={dropsContract(m.chain_id)}
          stats={{
            marketCapUsd: Number(m.market_cap_usd ?? 0),
            priceUsd: Number(m.price_usd ?? 0),
            volume24Usd: Number(m.volume24_usd ?? 0),
            volumeAllUsd: Number(m.volume_all_usd ?? 0),
            feesClaimedUsd: Number(m.fees_claimed_usd ?? 0),
            feesUnclaimedUsd: Number(m.fees_unclaimed_usd ?? 0),
            feeCurrent: m.fee_current ?? null,
            holders: Number(m.holders_count ?? 0),
            launchedAt: m.launched_at,
            dropsPaidUsd: Number(m.drops_paid_usd ?? 0),
          }}
        />
      )}
    </main>
  );
}
