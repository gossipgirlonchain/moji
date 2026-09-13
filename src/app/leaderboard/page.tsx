import Link from "next/link";
import { Card, Label } from "@/components/ui";
import { Leaderboard } from "@/components/Leaderboard";
import { listLaunchers } from "@/lib/leaderboard";
import { listMojis } from "@/lib/data";

export const revalidate = 30;
export const metadata = { title: "leaderboard · moji", description: "Top launchers and top mojis. Rewards go to the top of the board." };

export default async function LeaderboardPage() {
  const [launchers, mojis] = await Promise.all([listLaunchers(), listMojis({ sort: "mcap", limit: 200 })]);
  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <h1 className="text-[30px] text-sky-600">leaderboard</h1>
        <p className="heading mt-1 text-[16px] text-ink">{launchers.length.toLocaleString()} launchers · {mojis.length.toLocaleString()} mojis</p>
      </div>

      <Card tone="sky" pop={1}>
        <Label className="mb-2">Rewards</Label>
        <p className="heading text-[20px] leading-tight text-ink">Top launchers get rewarded.</p>
        <p className="mt-2 text-[14px] text-ink">
          Every moji you launch pays you 70% of its trading fees, in the stock and in the moji. The board ranks launchers by what they earn. Rewards
          for the top of the board are coming.
        </p>
        <Link href="/launch" className="press clay heading mt-4 block bg-sky-500 px-5 py-3 text-center text-[16px] text-white">
          LAUNCH A MOJI 🚀
        </Link>
      </Card>

      <Leaderboard launchers={launchers} mojis={mojis} />
    </main>
  );
}
