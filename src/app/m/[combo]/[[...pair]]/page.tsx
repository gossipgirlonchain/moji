import { notFound } from "next/navigation";
import { getMoji } from "@/lib/data";
import { decodeCombo } from "@/lib/emoji";
import { MojiPageBody, mojiPageMetadata } from "@/components/MojiPage";

export const revalidate = 15;

type Params = Promise<{ combo: string; pair?: string[] }>;

/** /m/🍎 → earliest launch of 🍎. /m/🍎/AAPL → the AAPL pair. /m/🍎/AAPL/8453 → that pair on that chain. */
function pairOpts(pair?: string[]): [string | null, number | null] {
  return [pair?.[0] ? decodeURIComponent(pair[0]) : null, Number(pair?.[1] ?? 0) || null];
}

export async function generateMetadata({ params }: { params: Params }) {
  const { combo, pair } = await params;
  const d = decodeCombo(combo);
  return mojiPageMetadata(await getMoji(d, ...pairOpts(pair)), d);
}

export default async function MojiPage({ params }: { params: Params }) {
  const { combo, pair } = await params;
  const m = await getMoji(decodeCombo(combo), ...pairOpts(pair));
  if (!m) notFound();
  return <MojiPageBody m={m} />;
}
