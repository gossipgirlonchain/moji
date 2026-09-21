import { ExploreList } from "@/components/ExploreList";
import { listMojis } from "@/lib/data";

export const revalidate = 30;
export const metadata = { title: "explore mojis" };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, initial] = await Promise.all([searchParams, listMojis({ sort: "mcap" })]);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600 lg:text-left">explore</h1>
      <ExploreList initial={initial} initialQ={q ?? ""} />
    </main>
  );
}
