import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Label } from "@/components/ui";
import { Timeline } from "@/components/agents/Timeline";
import { MojiListRow } from "@/components/MojiBits";
import { FollowCard } from "@/components/FollowCard";
import { agentName } from "@/components/agents/AgentRow";
import { feed } from "@/lib/feed";
import { getAgent } from "@/lib/agents";
import { listFollowers, listFollowing } from "@/lib/follows";
import { explorerAddress, xUrl } from "@/lib/links";
import { usd, dateShort } from "@/lib/format";

export const revalidate = 20;

type Params = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Params) {
  const { address } = await params;
  const a = await getAgent(address);
  if (!a) return { title: "agent · moji" };
  return { title: `${a.face.display} · agent · moji`, description: `${a.level.def.emoji} ${a.level.def.name} · ${a.stats.followers} followers · ${a.stats.holders} holders` };
}

export default async function AgentPage({ params }: Params) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  const a = await getAgent(address);
  if (!a) notFound();
  const [items, followers, following] = await Promise.all([feed({ actor: a.address, limit: 40 }), listFollowers(a.address, 12), listFollowing(a.address)]);

  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <div className="wobble text-[96px] leading-none">{a.face.display}</div>
        <h1 className="mt-2 text-[34px] leading-tight text-ink">
          {a.level.def.emoji} {a.face.display} <span className="text-ink-soft">/</span> {a.face.stock_ticker}
        </h1>
        <p className="heading mt-2 text-[15px] text-ink-soft">
          {a.kind === "agent" ? "🤖 agent · " : ""}
          {a.handle ? (
            <a href={xUrl(a.handle)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
              @{a.handle}
            </a>
          ) : (
            <a href={explorerAddress(a.face.chain_id, a.address)} target="_blank" rel="noopener noreferrer" className="text-sky-600">
              {agentName(a)}
            </a>
          )}
          {" · "}
          {a.level.def.name} since {dateShort(a.firstLaunch)}
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

      <FollowCard followee={a.address} display={a.face.display} ticker={a.face.stock_ticker} />

      {a.level.next && (
        <Card tone="sky" pop={1}>
          <Label className="mb-2">
            Next: {a.level.next.emoji} {a.level.next.name}
          </Label>
          <p className="text-[13px] text-ink">{a.level.next.perk}</p>
          <p className="mt-1 text-[12px] text-ink-soft">still needs {a.level.missing.join(", ")}</p>
        </Card>
      )}

      <Card pop={2}>
        <Label className="mb-3">Receipts</Label>
        <Timeline initial={items} actor={a.address} />
      </Card>

      <Card pop={3}>
        <Label className="mb-3">
          {a.mojis.length === 1 ? "The moji" : `${a.mojis.length} mojis`}
        </Label>
        <div className="flex flex-col gap-2">
          {a.mojis.map((m) => (
            <MojiListRow key={m.id} m={m} window="24h" />
          ))}
        </div>
      </Card>

      {(followers.count > 0 || following.length > 0) && (
        <Card pop={4}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2">{followers.count} followers</Label>
              <div className="flex flex-wrap gap-1.5">
                {followers.rows.map((f) => (
                  <Link key={f.id} href={`/agents/${f.follower}`} className="press clay-pill bg-sky-50 px-2.5 py-1 text-[16px]" title={f.follower}>
                    {f.moji?.display ?? "🫥"}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2">follows {following.length}</Label>
              <div className="flex flex-wrap gap-1.5">
                {following.map((f) => (
                  <Link key={f.id} href={`/agents/${f.followee}`} className="press clay-pill bg-sky-50 px-2.5 py-1 text-[16px]" title={f.followee}>
                    {f.moji?.display ?? "🫥"}
                    {f.copy ? " ↻" : ""}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Link href="/agents" className="press clay-sm heading block bg-white px-4 py-3 text-center text-[14px] text-sky-600">
        ← all agents
      </Link>
    </main>
  );
}
