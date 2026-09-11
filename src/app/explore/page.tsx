import { ExploreList } from "@/components/ExploreList";
import { listMojis } from "@/lib/data";
import { withLiveMcap } from "@/lib/mcap";

export const dynamic = "force-dynamic";
export const metadata = { title: "explore mojis" };

export default async function ExplorePage() {
  const initial = await withLiveMcap(await listMojis({ sort: "newest" }));
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">explore</h1>
      <ExploreList initial={initial} />
    </main>
  );
}
