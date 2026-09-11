import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Label, LinkButton } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { PriceChart } from "@/components/PriceChart";
import { getMoji } from "@/lib/data";
import { getMarket } from "@/lib/market";
import { getMojiFees } from "@/lib/fees";
import { FeesCard } from "@/components/FeesCard";
import { feePct } from "@/config/fees";
import { decodeCombo } from "@/lib/emoji";
import { dateShort, num, short } from "@/lib/format";
import { dexscreenerUrl, explorerAddress, explorerTx, matchaUrl, xUrl } from "@/lib/links";
import { findStock } from "@/config/stocks";
import { PostIt } from "@/components/PostIt";
import { SITE_URL } from "@/lib/network";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ combo: string }> }) {
  const { combo } = await params;
  const d = decodeCombo(combo);
  const m = await getMoji(d);
  const title = m ? `${m.display} / ${m.stock_ticker} · moji` : `${d} · moji`;
  const description = m ? `${m.display} is a moji, paired to $${m.stock_ticker}.` : `${d} is a moji.`;
  const url = `${SITE_URL}/m/${encodeURIComponent(d)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "moji", type: "website" },
    twitter: { card: "summary_large_image", title, description, site: "@moji" },
  };
}

export default async function MojiPage({ params }: { params: Promise<{ combo: string }> }) {
  const { combo } = await params;
  const m = await getMoji(decodeCombo(combo));
  if (!m) notFound();
  const market = await getMarket(m);
  const fees = await getMojiFees(m, { stockUsd: market.stockPriceUsd, mojiUsd: market.priceUsd });
  const stock = findStock(m.chain_id, m.stock_address);
  const creator = m.creator_handle
    ? { label: `@${m.creator_handle}`, href: xUrl(m.creator_handle) }
    : m.creator_address
      ? { label: short(m.creator_address), href: explorerAddress(m.chain_id, m.creator_address) }
      : null;

  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <div className="wobble text-[96px] leading-none">{m.display}</div>
        <h1 className="mt-2 text-[34px] leading-tight text-ink">
          {m.display} <span className="text-ink-soft">/</span> {m.stock_ticker}
        </h1>
        <p className="heading mt-3 text-[17px] text-ink-soft">
          paired to <span className="text-ink">${m.stock_ticker}</span>
          {stock && <span className="text-[13px]"> · {stock.name}</span>}
        </p>
        {fees.schedule && (
          <p className="heading mt-1 text-[13px] text-ink-soft">
            swap fee{" "}
            {fees.schedule.decaying ? (
              <span className="text-coral">
                {feePct(fees.schedule.currentFee)} → {feePct(fees.schedule.endFee)}
              </span>
            ) : (
              <span className="text-ink">{feePct(fees.schedule.currentFee)}</span>
            )}
          </p>
        )}
        {creator && (
          <p className="heading mt-1 text-[13px] text-ink-soft">
            launched by{" "}
            <a href={creator.href} target="_blank" rel="noopener noreferrer" className="text-sky-600">
              {creator.label}
            </a>
          </p>
        )}
      </div>

      <Card pop={1}>
        <PriceChart combo={m.display} marketCapUsd={market.marketCapUsd} priceUsd={market.priceUsd} />
      </Card>

      <FeesCard
        combo={m.display}
        ticker={m.stock_ticker}
        chainId={m.chain_id}
        tokenAddress={m.token_address}
        poolId={m.pool_id}
        creatorAddress={m.creator_address}
        pending={fees.pending}
        pendingUsd={fees.pendingUsd}
        pendingStockUsd={fees.pendingStockUsd}
        pendingMojiUsd={fees.pendingMojiUsd}
        claimedUsd={fees.claimedUsd}
        sources={fees.sources}
        schedule={fees.schedule}
        live={fees.live}
        error={fees.error}
      />

      <div className="grid grid-cols-2 gap-3">
        {m.token_address ? (
          <>
            <LinkButton href={matchaUrl(m.chain_id, m.token_address)} tone="outline" external className="pop pop-3 text-[15px]">
              Trade on Matcha ↗
            </LinkButton>
            <LinkButton href={dexscreenerUrl(m.chain_id, m.token_address, m.pool_id)} tone="outline" external className="pop pop-3 text-[15px]">
              View on Dexscreener ↗
            </LinkButton>
          </>
        ) : (
          <p className="col-span-2 text-center text-[13px] text-ink-soft">token address pending, links appear once the launch is on-chain</p>
        )}
      </div>

      <PostIt combo={m.display} ticker={m.stock_ticker} url={`${SITE_URL}/m/${encodeURIComponent(m.display)}`} />

      <Card pop={4}>
        <Label className="mb-3">Details</Label>
        <dl className="flex flex-col gap-3 text-[14px]">
          <Row k="Contract">
            {m.token_address ? (
              <span className="flex items-center gap-2">
                <a href={explorerAddress(m.chain_id, m.token_address)} target="_blank" rel="noopener noreferrer" className="mono text-sky-600">
                  {short(m.token_address, 6, 6)}
                </a>
                <CopyButton text={m.token_address} />
              </span>
            ) : (
              <span className="text-ink-soft">pending</span>
            )}
          </Row>
          <Row k={`Paired stock · ${m.stock_ticker}`}>
            <span className="flex items-center gap-2">
              <a href={explorerAddress(m.chain_id, m.stock_address)} target="_blank" rel="noopener noreferrer" className="mono text-sky-600">
                {short(m.stock_address, 6, 6)}
              </a>
              <CopyButton text={m.stock_address} />
            </span>
          </Row>
          <Row k="Supply">
            <span className="num">{m.supply ? num(m.supply) : "—"}</span>
          </Row>
          <Row k="Launched by">
            {creator ? (
              <a href={creator.href} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                {creator.label}
              </a>
            ) : (
              <span className="text-ink-soft">anon</span>
            )}
          </Row>
          <Row k="Launch date">
            <span>
              {dateShort(m.launched_at)}
              {m.tx_hash && (
                <>
                  {" · "}
                  <a href={explorerTx(m.chain_id, m.tx_hash)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                    tx
                  </a>
                </>
              )}
            </span>
          </Row>
        </dl>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 pb-[max(14px,env(safe-area-inset-bottom))] pt-3" style={{ background: "linear-gradient(to top, var(--sky-100) 65%, transparent)" }}>
        <div className="mx-auto max-w-[460px] px-5">
          <Link href="/launch" className="press clay heading block bg-sky-500 px-6 py-4 text-center text-[19px] text-white">
            LAUNCH YOUR OWN MOJI
          </Link>
        </div>
      </div>
    </main>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="heading text-[12px] uppercase tracking-[0.1em] text-ink-soft">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
