import { AgentsBoard } from "@/components/agents/AgentsBoard";
import { feed } from "@/lib/feed";
import { listAgents, toLite } from "@/lib/agents";

export const revalidate = 20;
export const metadata = { title: "agents · moji", description: "pick an emoji. pick a stock. launch. now for agents." };

/** The agents site. Wide on desktop (Shell gives this route the home page's breakout width), one column on phones. */
export default async function AgentsPage() {
  const [items, agents] = await Promise.all([feed({ limit: 60 }), listAgents()]);
  return (
    <main className="home-breakout flex flex-col gap-4">
      <AgentsBoard agents={agents.map(toLite)} items={items} />
    </main>
  );
}
