import Link from "next/link";
import { Card, Label, LinkButton, Circle } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { McapRow } from "@/components/MojiBits";
import { HomeTiles } from "@/components/HomeTiles";
import { claimsCount, listMojis } from "@/lib/data";
import { StockTicker } from "@/components/home/StockTicker";
import { TopMojis } from "@/components/home/TopMojis";
import { HomeExplore } from "@/components/home/HomeExplore";
import { StockEcosystem } from "@/components/home/StockEcosystem";
import { HomeViews } from "@/components/home/HomeViews";

export const revalidate = 30;

export default async function Home() {
  const [count, top, recent, all] = await Promise.all([claimsCount(), listMojis({ sort: "mcap", limit: 16 }), listMojis({ sort: "newest", limit: 16 }), listMojis({ sort: "mcap", limit: 500 })]);

  return (
    <>
      {/* desktop: wide layout, more mojis on screen */}
      <main className="home-desktop flex-col gap-5">
        <div className="pop flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Wordmark />
            <p className="heading text-[18px] text-ink">pick an emoji. pick a stock or token. launch.</p>
          </div>
          <Link href="/launch" className="press clay heading shrink-0 bg-sky-500 px-7 py-3.5 text-[17px] text-white">
            LAUNCH A MOJI 🚀
          </Link>
        </div>
        <StockTicker mojis={all} />
        <HomeViews
          stocks={<StockEcosystem mojis={all} />}
          mojis={
            <>
              <TopMojis mojis={top} />
              <HomeExplore mojis={all} count={count} />
            </>
          }
        />
        <p className="text-center text-[13px] text-ink-soft">
          pick a stock or token · claim your emoji · launch · 🪂 drop rewards to your holders · built on <Link href="/about" className="text-sky-600">Doppler</Link>.
        </p>
      </main>

      {/* phone column, unchanged */}
    <main className="home-phone flex-col gap-4">
      <div className="pop text-center">
        <Wordmark />
        <p className="heading text-[20px] text-ink">pick an emoji. pick a stock or token. launch.</p>
      </div>

      <LinkButton href="/launch" size="lg" className="pop pop-1">
        LAUNCH A MOJI 🚀
      </LinkButton>

      <Card pop={2}>
        <Label className="mb-3">Top market cap</Label>
        <div className="flex flex-col gap-2.5">
          {top.length === 0 && <p className="text-[14px] text-ink-soft">Nothing yet. Be first.</p>}
          {top.slice(0, 3).map((m, i) => (
            <McapRow key={m.id} m={m} rank={i + 1} />
          ))}
        </div>
      </Card>


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

      <HomeTiles top={top} recent={recent} count={count} />

      <p className="mt-2 text-center text-[13px] text-ink-soft">
        built on <Link href="/about" className="text-sky-600">Doppler</Link>.
      </p>
    </main>
    </>
  );
}
