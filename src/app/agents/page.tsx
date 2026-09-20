import { Terminal, type Stats } from "@/components/agents/Terminal";
import { feed } from "@/lib/feed";
import { listAgents, toLite } from "@/lib/agents";
import { listMojis } from "@/lib/data";

export const revalidate = 20;
export const metadata = { title: "agents · moji", description: "pick an emoji. pick a stock. launch. now for agents." };

/** The agents terminal. Wide on desktop (Shell gives this route the home page's breakout width), tabs on a phone. */
export default async function AgentsPage() {
  const [items, agents, mojis] = await Promise.all([feed({ limit: 120 }), listAgents(), listMojis({ sort: "volume", window: "24h", limit: 300 })]);
  const day = Date.now() - 86_400_000;
  const stats: Stats = {
    agents: agents.length,
    bots: agents.filter((a) => a.kind === "agent").length,
    mojis: mojis.length,
    launches24: mojis.filter((m) => new Date(m.launched_at).getTime() > day).length,
    volume24: mojis.reduce((s, m) => s + Number(m.volume24_usd ?? 0), 0),
    fees: agents.reduce((s, a) => s + a.stats.feesUsd, 0),
    receiptsToday: items.filter((i) => i.ts * 1000 > day).length,
  };
  return (
    <main className="home-breakout flex flex-col">
      <Terminal agents={agents.map(toLite)} items={items} mojis={mojis} stats={stats} />
    </main>
  );
}
