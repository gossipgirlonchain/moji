import Link from "next/link";
import { Card, Label, LinkButton } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { PriceChart } from "@/components/PriceChart";
import type { MojiRow } from "@/lib/supabase";
import { isMemeRow } from "@/lib/memecoin";
import { mojiHref, hasHolderRewards } from "@/components/MojiBits";
import { FeesCard } from "@/components/FeesCard";
import { dateShort, num, short } from "@/lib/format";
import { dexscreenerUrl, explorerAddress, explorerTx, matchaUrl, xUrl } from "@/lib/links";
import { findStock } from "@/config/stocks";
import { PostIt } from "@/components/PostIt";
import { DropsCard } from "@/components/drops/DropsCard";
import { SITE_URL } from "@/lib/network";
import { TradeCard } from "@/components/TradeCard";
import { FollowCard } from "@/components/FollowCard";
import { findNumeraire } from "@/lib/numeraire";
import { CreatorMeme } from "@/components/CreatorMeme";

/** Metadata for a moji or meme page; `d` is what the URL asked for when there is no row. */
export function mojiPageMetadata(m: MojiRow | null, d: string) {
  const title = m ? `${m.display} / ${m.stock_ticker} · moji` : `${d} · moji`;
  const description = m ? `${m.display} is a moji, paired to $${m.stock_ticker}.` : `${d} is a moji.`;
  const url = m ? `${SITE_URL}${mojiHref(m)}` : `${SITE_URL}/m/${encodeURIComponent(d)}`;
  const image = m
    ? `${SITE_URL}/api/og/${isMemeRow(m) ? `meme/${encodeURIComponent(m.symbol ?? "")}` : encodeURIComponent(m.display)}?chain=${m.chain_id}&pair=${m.stock_address}`
    : `${SITE_URL}/api/og/${encodeURIComponent(d)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "moji", type: "website", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, site: "@moji", images: [image] },
  };
}

/** The page for a moji or a MEME launch: hero, chart, trade, fees, drops, share, details. */
export function MojiPageBody({ m }: { m: MojiRow }) {
  // Snapshot values for an instant first paint; FeesCard and PriceChart fetch live numbers after mount.
  const market = { marketCapUsd: Number(m.market_cap_usd ?? 0), priceUsd: Number(m.price_usd ?? 0) };
  const fees = {
    pending: { stock: Number(m.fees_stock_pending ?? 0), moji: Number(m.fees_moji_pending ?? 0) },
    pendingUsd: Number(m.fees_unclaimed_usd ?? 0),
    pendingStockUsd: 0,
    pendingMojiUsd: 0,
    claimedUsd: Number(m.fees_claimed_usd ?? 0),
    sources: { pool: Number(m.fees_stock_pending ?? 0) > 0 || Number(m.fees_moji_pending ?? 0) > 0, hook: false },
    bySource: undefined as undefined | { pool: { stock: number; moji: number }; hook: { stock: number; moji: number } },
    schedule: null as null | { startFee: number; endFee: number; currentFee: number; startingTime: number; durationSeconds: number; decaying: boolean },
    live: Boolean(m.snapshot_at),
    error: undefined as string | undefined,
  };
  const stock = findStock(m.chain_id, m.stock_address);
  const creator = m.creator_handle
    ? { label: `@${m.creator_handle}`, href: xUrl(m.creator_handle) }
    : m.creator_address
      ? { label: `${m.creator_kind === "agent" ? "🤖 " : ""}${short(m.creator_address)}`, href: explorerAddress(m.chain_id, m.creator_address) }
      : null;

  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        {m.meme_url ? (
          <div className="clay relative mx-auto aspect-square w-full max-w-[400px] overflow-hidden bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.meme_url} alt={`${m.display} meme`} className="block h-full w-full object-cover" />
            <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[40px] leading-none shadow-sm" aria-hidden>
              {m.display}
            </span>
          </div>
        ) : (
          <div className="wobble text-[96px] leading-none">{m.display}</div>
        )}
        <h1 className="mt-2 text-[34px] leading-tight text-ink">
          {m.display} <span className="text-ink-soft">/</span> {m.stock_ticker}
        </h1>
        {isMemeRow(m) && m.name && <p className="heading mt-1 text-[19px] text-ink">{m.name}</p>}
        <p className="heading mt-3 text-[17px] text-ink-soft">
          paired to <span className="text-ink">${m.stock_ticker}</span>
          {stock && <span className="text-[13px]"> · {stock.name}</span>}
        </p>
        {creator && (
          <p className="heading mt-1 text-[13px] text-ink-soft">
            launched by{" "}
            <a href={creator.href} target="_blank" rel="noopener noreferrer" className="text-sky-600">
              {creator.label}
            </a>
          </p>
        )}
        {isMemeRow(m) && <CreatorMeme mojiId={m.id} combo={m.display} chainId={m.chain_id} pair={m.stock_address} creatorDid={m.creator_did} creatorAddress={m.creator_address} memeUrl={m.meme_url ?? null} />}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {hasHolderRewards(m) && (
            <a href="#rewards" className="press clay-pill heading inline-flex items-center gap-1.5 bg-mint px-4 py-2 text-[14px] text-white">
              🪂 holder rewards
            </a>
          )}
          {m.telegram_url && (
            <a href={m.telegram_url} target="_blank" rel="noopener noreferrer" className="press clay-pill heading inline-flex items-center gap-1.5 bg-sky-500 px-4 py-2 text-[14px] text-white">
              Telegram ↗
            </a>
          )}
        </div>
      </div>

      <Card pop={1}>
        <PriceChart combo={m.display} chainId={m.chain_id} pair={m.stock_address} marketCapUsd={market.marketCapUsd} priceUsd={market.priceUsd} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {m.token_address ? (
          <>
            <LinkButton href={matchaUrl(m.chain_id, m.token_address)} tone="outline" size="sm" external className="pop pop-2 whitespace-nowrap px-3 text-[13px]">
              Matcha ↗
            </LinkButton>
            <LinkButton href={dexscreenerUrl(m.chain_id, m.token_address, m.pool_id)} tone="outline" size="sm" external className="pop pop-2 whitespace-nowrap px-3 text-[13px]">
              Dexscreener ↗
            </LinkButton>

          </>
        ) : (
          <p className="col-span-2 text-center text-[13px] text-ink-soft">token address pending, links appear once the launch is on-chain</p>
        )}
      </div>

      {m.token_address && m.pool_id && (
        <TradeCard combo={m.display} ticker={m.stock_ticker} chainId={m.chain_id} tokenAddress={m.token_address} stockAddress={m.stock_address} stockDecimals={findNumeraire(m.chain_id, m.stock_address)?.decimals ?? 18} poolId={m.pool_id} />
      )}

      {m.creator_address && <FollowCard followee={m.creator_address} display={m.display} ticker={m.stock_ticker} />}

      <FeesCard
        combo={m.display}
        ticker={m.stock_ticker}
        chainId={m.chain_id}
        stockAddress={m.stock_address}
        tokenAddress={m.token_address}
        poolId={m.pool_id}
        creatorAddress={m.creator_address}
        pending={fees.pending}
        claimed={{ stock: Number(m.fees_creator_stock_claimed ?? 0), moji: Number(m.fees_creator_moji_claimed ?? 0) }}
        pendingUsd={fees.pendingUsd}
        pendingStockUsd={fees.pendingStockUsd}
        pendingMojiUsd={fees.pendingMojiUsd}
        claimedUsd={fees.claimedUsd}
        sources={fees.sources}
        schedule={fees.schedule}
        live={fees.live}
        error={fees.error}
      />


      <div id="rewards" className="scroll-mt-4" />
      <DropsCard combo={m.display} ticker={m.stock_ticker} chainId={m.chain_id} stockAddress={m.stock_address} manageHref={`/drops/${encodeURIComponent(m.display)}/${encodeURIComponent(m.stock_ticker)}/${m.chain_id}`} />

      <PostIt combo={m.display} ticker={m.stock_ticker} url={`${SITE_URL}${mojiHref(m)}`} ca={m.token_address} />

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
