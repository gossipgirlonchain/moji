import { notFound } from "next/navigation";
import { getMeme } from "@/lib/data";
import { memeDisplay } from "@/lib/memecoin";
import { MojiPageBody, mojiPageMetadata } from "@/components/MojiPage";

export const revalidate = 15;

type Params = Promise<{ symbol: string; pair?: string[] }>;

/** /meme/PEPE → earliest $PEPE. /meme/PEPE/AAPL → the AAPL pair. /meme/PEPE/AAPL/8453 → that pair on that chain. */
function pairOpts(pair?: string[]): [string | null, number | null] {
  return [pair?.[0] ? decodeURIComponent(pair[0]) : null, Number(pair?.[1] ?? 0) || null];
}

export async function generateMetadata({ params }: { params: Params }) {
  const { symbol, pair } = await params;
  const d = decodeURIComponent(symbol);
  return mojiPageMetadata(await getMeme(d, ...pairOpts(pair)), memeDisplay(d));
}

export default async function MemePage({ params }: { params: Params }) {
  const { symbol, pair } = await params;
  const m = await getMeme(decodeURIComponent(symbol), ...pairOpts(pair));
  if (!m) notFound();
  return <MojiPageBody m={m} />;
}
