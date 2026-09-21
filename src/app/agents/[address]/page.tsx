import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Label, LinkButton } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { PriceChart } from "@/components/PriceChart";
import { TradeCard } from "@/components/TradeCard";
import { FeesCard } from "@/components/FeesCard";
import { DropsCard } from "@/components/drops/DropsCard";
import { PostIt } from "@/components/PostIt";
import { FollowCard } from "@/components/FollowCard";
import { NameCard } from "@/components/agents/NameCard";
import { Timeline } from "@/components/agents/Timeline";
import { MojiListRow, mojiHref } from "@/components/MojiBits";
import { MojiArt } from "@/components/MojiArt";
import { feed } from "@/lib/feed";
import { getAgent } from "@/lib/agents";
import { resolveName } from "@/lib/agent-names";
import { listFollowers, listFollowing } from "@/lib/follows";
import { findNumeraire } from "@/lib/numeraire";
import { dexscreenerUrl, explorerAddress, explorerTx, matchaUrl, xUrl } from "@/lib/links";
import { usd, dateShort, num, short } from "@/lib/format";
import { SITE_URL } from "@/lib/network";

export const revalidate = 15;

type Params = { params: Promise<{ address: string }> };

/** /agents/0x… or /agents/@name (also /agents/name). */
async function toAddress(param: string): Promise<string | null> {
  const p = decodeURIComponent(param);
  if (/^0x[0-9a-fA-F]{40}$/.test(p)) return p;
  return resolveName(p);
}

export async function generateMetadata({ params }: Params) {
  const { address: param } = await params;
  const address = await toAddress(param);
  const a = address ? await getAgent(address) : null;
  if (!a) return { title: "agent · moji" };
  const title = `${a.name ? `@${a.name} ` : ""}${a.face.display} / ${a.face.stock_ticker} · agent · moji`;
  const image = `${SITE_URL}/api/og/${encodeURIComponent(a.face.display)}?chain=${a.face.chain_id}&pair=${a.mojis[0].stock_address}`;
  return { title, description: `${a.stats.followers} followers · ${a.stats.holders} holders`, openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title, images: [image] } };
}

/**
 * An agent's page: the moji page of its face (chart, trade, fees, drops, share, details) plus the agent layer
 * (name, follow, receipts, its other mojis, followers and follows).
 */
export default async function AgentPage({ params }: Params) {
  const { address: param } = await params;
  const address = await toAddress(param);
  if (!address) notFound();
  const a = await getAgent(address);
  if (!a) notFound();
  const m = a.mojis[0];
  const [items, followers, following] = await Promise.all([feed({ actor: a.address, limit: 40 }), listFollowers(a.address, 12), listFollowing(a.address)]);
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
  const title = a.name ? `@${a.name}` : a.face.display;

  return (
    <main className="flex flex-col gap-4 pb-16">
      <div className="pop text-center">
        {a.face.meme_url ? (
          <span className="clay mx-auto inline-block overflow-hidden bg-white">
            <MojiArt m={a.face} size={160} radius={32} emojiSize={96} eager />
          </span>
        ) : (
          <div className="wobble text-[96px] leading-none">{a.face.display}</div>
        )}
        <h1 className="mt-2 text-[34px] leading-tight text-ink">
          {title} <span className="text-ink-soft">/</span> {a.face.stock_ticker}
        </h1>
        <p className="heading mt-2 text-[15px] text-ink-soft">
          {a.kind === "agent" ? "🤖 agent · " : ""}
          {a.name ? <>{a.face.display} · </> : null}
          {a.handle ? (
            <a href={xUrl(a.handle)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
              @{a.handle}
            </a>
          ) : (
            <a href={explorerAddress(a.face.chain_id, a.address)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
              {short(a.address)}
            </a>
          )}
          {" · "}
          since {dateShort(a.firstLaunch)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          [String(a.stats.followers), "followers"],
          [a.stats.holders.toLocaleString(), "holders"],
          [usd(a.stats.volumeUsd), "volume"],
          [usd(a.stats.feesUsd), "fees earned"],
          [String(a.stats.drops), "drops paid"],
          [String(a.stats.days), "days alive"],
        ].map(([v, l]) => (
          <div key={l} className="clay-sm bg-white px-3 py-3 text-center">
            <div className="heading text-[18px] text-ink">{v}</div>
            <div className="heading text-[10px] uppercase tracking-[0.1em] text-ink-soft">{l}</div>
          </div>
        ))}
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
          <p className="col-span-2 text-center text-[13px] text-ink-soft">token address pending</p>
        )}
      </div>

      {m.token_address && m.pool_id && (
        <TradeCard combo={m.display} ticker={m.stock_ticker} chainId={m.chain_id} tokenAddress={m.token_address} stockAddress={m.stock_address} stockDecimals={findNumeraire(m.chain_id, m.stock_address)?.decimals ?? 18} poolId={m.pool_id} />
      )}

      <NameCard agent={a.address} current={a.name} />

      <FollowCard followee={a.address} display={title} ticker={a.face.stock_ticker} />

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

      <PostIt combo={m.display} ticker={m.stock_ticker} url={`${SITE_URL}/agents/${a.name ? `@${a.name}` : a.address}`} ca={m.token_address} />

      <Card pop={2}>
        <Label className="mb-3">Receipts</Label>
        <Timeline initial={items} actor={a.address} />
      </Card>

      {a.mojis.length > 1 && (
        <Card pop={3}>
          <Label className="mb-3">{a.mojis.length} mojis</Label>
          <div className="flex flex-col gap-2">
            {a.mojis.map((x) => (
              <MojiListRow key={x.id} m={x} window="24h" />
            ))}
          </div>
        </Card>
      )}

      {(followers.count > 0 || following.length > 0) && (
        <Card pop={4}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2">{followers.count} followers</Label>
              <div className="flex flex-wrap gap-1.5">
                {followers.rows.map((f) => (
                  <Link key={f.id} href={`/agents/${f.follower}`} className="press clay-pill bg-sky-50 px-2.5 py-1 text-[16px]" title={f.name ? `@${f.name}` : f.follower}>
                    {f.moji?.display ?? "🫥"}
                    {f.name ? <span className="heading ml-1 text-[12px] text-ink">@{f.name}</span> : null}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2">follows {following.length}</Label>
              <div className="flex flex-wrap gap-1.5">
                {following.map((f) => (
                  <Link key={f.id} href={`/agents/${f.followee}`} className="press clay-pill bg-sky-50 px-2.5 py-1 text-[16px]" title={f.name ? `@${f.name}` : f.followee}>
                    {f.moji?.display ?? "🫥"}
                    {f.name ? <span className="heading ml-1 text-[12px] text-ink">@{f.name}</span> : null}
                    {f.copy ? " ↻" : ""}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card pop={5}>
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
          <Row k={`Paired · ${m.stock_ticker}`}>
            <span className="flex items-center gap-2">
              <a href={explorerAddress(m.chain_id, m.stock_address)} target="_blank" rel="noopener noreferrer" className="mono text-sky-600">
                {short(m.stock_address, 6, 6)}
              </a>
              <CopyButton text={m.stock_address} />
            </span>
          </Row>
          <Row k="Wallet">
            <span className="flex items-center gap-2">
              <a href={explorerAddress(m.chain_id, a.address)} target="_blank" rel="noopener noreferrer" className="mono text-sky-600">
                {short(a.address, 6, 6)}
              </a>
              <CopyButton text={a.address} />
            </span>
          </Row>
          <Row k="Supply">
            <span className="num">{m.supply ? num(m.supply) : "—"}</span>
          </Row>
          <Row k="Launched">
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
          <Row k="Moji page">
            <Link href={mojiHref(m)} className="text-sky-600">
              {m.display} / {m.stock_ticker}
            </Link>
          </Row>
        </dl>
      </Card>

      <Link href="/agents" className="press clay-sm heading block bg-white px-4 py-3 text-center text-[14px] text-sky-600">
        ← all agents
      </Link>
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
