import Link from "next/link";
import { Card, Label, LinkButton, Circle } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { ClaimsCounter } from "@/components/ClaimsCounter";
import { EarnerRow, MojiTile } from "@/components/MojiBits";
import { claimsCount, listMojis, topEarners } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [count, earners, recent] = await Promise.all([claimsCount(), topEarners(3), listMojis({ sort: "newest", limit: 6 })]);

  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <Wordmark />
        <p className="heading text-[20px] text-ink">pick an emoji. pick a stock. launch.</p>
        <Link href="/claimed" className="press clay-pill mt-3 inline-block bg-white px-4 py-2">
          <ClaimsCounter initial={count} />
        </Link>
      </div>

      <LinkButton href="/launch" size="lg" className="pop pop-1">
        LAUNCH A MOJI 🚀
      </LinkButton>

      <Card pop={2}>
        <Label className="mb-3">Top earners</Label>
        <div className="flex flex-col gap-2.5">
          {earners.length === 0 && <p className="text-[14px] text-ink-soft">No fees yet. First mover gets the spot.</p>}
          {earners.map((m, i) => (
            <EarnerRow key={m.id} m={m} rank={i + 1} />
          ))}
        </div>
      </Card>

      <Card tone="sky" pop={3}>
        <Label className="mb-3">How it works</Label>
        <div className="flex flex-col gap-3">
          {[
            ["1", "Pick a stock"],
            ["2", "Claim your emoji"],
            ["3", "Launch"],
          ].map(([n, t]) => (
            <div key={n} className="flex items-center gap-3">
              <Circle size={48} className="bg-white">
                <span className="heading text-[20px] text-sky-600">{n}</span>
              </Circle>
              <span className="heading text-[19px]">{t}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[14px] text-ink-soft">your combo is yours forever. once it&apos;s gone, it&apos;s gone.</p>
      </Card>

      <Card pop={4}>
        <div className="mb-3 flex items-center justify-between">
          <Label>Recently launched</Label>
          <Link href="/explore" className="heading text-[13px] text-sky-600">
            see all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-[14px] text-ink-soft">Nothing yet. Be first.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {recent.map((m, i) => (
              <MojiTile key={m.id} m={m} pop={Math.min(5, i)} />
            ))}
          </div>
        )}
      </Card>

      <p className="mt-2 text-center text-[13px] text-ink-soft">
        built on <Link href="/about" className="text-sky-600">Doppler</Link>. moji never trades. you launch here, the market happens elsewhere.
      </p>
    </main>
  );
}
