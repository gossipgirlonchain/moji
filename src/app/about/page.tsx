import Link from "next/link";
import { Card, Label } from "@/components/ui";

export const metadata = { title: "about moji" };

export default function AboutPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">about</h1>
      <Card pop={1}>
        <Label className="mb-2">What moji is</Label>
        <p className="text-[15px] leading-relaxed">
          A launcher, not an exchange. Pick a 1 to 3 emoji combo, pair it to a real tokenized stock, launch with one signature.
          You never trade on moji. The market happens on Matcha and Dexscreener.
        </p>
      </Card>
      <Card tone="sky" pop={2}>
        <Label className="mb-2">Built on Doppler</Label>
        <p className="text-[15px] leading-relaxed">
          Every moji is a Doppler multicurve launch. Doppler is the price discovery protocol by Whetstone Research: the token, the
          Uniswap V4 pool, the curves and the fee streaming all come from the Doppler Airlock. Moji is a thin skin on top.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <a href="https://github.com/whetstoneresearch/doppler-sdk" target="_blank" rel="noopener noreferrer" className="press clay-sm heading bg-white px-4 py-3 text-center text-[15px] text-sky-600">
            github.com/whetstoneresearch/doppler-sdk
          </a>
          <a href="https://docs.doppler.lol" target="_blank" rel="noopener noreferrer" className="press clay-sm heading bg-white px-4 py-3 text-center text-[15px] text-sky-600">
            docs.doppler.lol
          </a>
        </div>
      </Card>
      <Card pop={3}>
        <Label className="mb-2">The stocks</Label>
        <p className="text-[15px] leading-relaxed">
          Pairs are Robinhood Stock Tokens on Robinhood Chain, the same list the LONG app loads. More chains light up as inventory is confirmed.
        </p>
      </Card>
      <Card pop={4}>
        <Label className="mb-2">Gas</Label>
        <p className="text-[15px] leading-relaxed">
          Not sponsored. You pay your own gas in the chain&apos;s native token. Sign in with X and you get a wallet, but you still have to fund it.
        </p>
      </Card>
      <Link href="/launch" className="press clay heading block bg-sky-500 px-6 py-4 text-center text-[18px] text-white">
        launch a moji
      </Link>
    </main>
  );
}
