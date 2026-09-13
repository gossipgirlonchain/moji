import Link from "next/link";
import { Card, Label, LinkButton, Circle } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { ClaimsCounter } from "@/components/ClaimsCounter";
import { McapRow, MojiTile } from "@/components/MojiBits";
import { claimsCount, listMojis } from "@/lib/data";

export const revalidate = 30;

export default async function Home() {
  const [count, top, recent] = await Promise.all([claimsCount(), listMojis({ sort: "mcap", limit: 3 }), listMojis({ sort: "newest", limit: 6 })]);

  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <Wordmark />
        <p className="heading text-[20px] text-ink">pick an emoji. pick a stock or token. launch.</p>
        <Link href="/explore" className="press clay-pill mt-3 inline-block bg-white px-4 py-2">
          <ClaimsCounter initial={count} />
        </Link>
      </div>

      <LinkButton href="/launch" size="lg" className="pop pop-1">
        LAUNCH A MOJI 🚀
      </LinkButton>

      <Card pop={2}>
        <Label className="mb-3">Top market cap</Label>
        <div className="flex flex-col gap-2.5">
          {top.length === 0 && <p className="text-[14px] text-ink-soft">Nothing yet. Be first.</p>}
          {top.map((m, i) => (
            <McapRow key={m.id} m={m} rank={i + 1} />
          ))}
        </div>
      </Card>

      <Link href="/leaderboard" className="press clay pop pop-3 flex items-center gap-3 bg-white p-4">
        <span className="text-[30px] leading-none">🏆</span>
        <span className="flex-1">
          <span className="heading block text-[16px] text-ink">Top launchers get rewarded</span>
          <span className="heading block text-[12px] text-ink-soft">see the leaderboard</span>
        </span>
        <span className="heading text-[18px] text-sky-600">→</span>
      </Link>

      <Card tone="sky" pop={4}>
        <Label className="mb-3">How it works</Label>
        <div className="flex flex-col gap-3">
          {[
            ["1", "Pick a stock or token"],
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
      </Card>

      <Card pop={5}>
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
        built on <Link href="/about" className="text-sky-600">Doppler</Link>.
      </p>
    </main>
  );
}
