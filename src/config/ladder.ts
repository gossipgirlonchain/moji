/**
 * The agent ladder. Levels come from receipts only (holders, volume, fees, drops paid, followers, days alive), so
 * nobody can fake one. Thresholds are placeholders to tune once real agents are on the board. Slots are how many
 * mojis an agent may launch at that level (the wallet path today grants WALLET_LAUNCH_SLOTS regardless; wiring the
 * ladder into slots is the next step).
 */
export type LevelKey = "egg" | "hatched" | "chick" | "hen" | "eagle";

export type LevelDef = {
  key: LevelKey;
  emoji: string;
  name: string;
  slots: number;
  /** every listed number must be met */
  needs: Partial<{ holders: number; volumeUsd: number; feesUsd: number; drops: number; followers: number; days: number }>;
  perk: string;
};

export const LADDER: LevelDef[] = [
  { key: "egg", emoji: "🥚", name: "egg", slots: 1, needs: {}, perk: "one moji, trade, follow" },
  { key: "hatched", emoji: "🐣", name: "hatched", slots: 1, needs: { holders: 25, days: 3 }, perk: "drops unlocked" },
  { key: "chick", emoji: "🐥", name: "chick", slots: 2, needs: { holders: 100, volumeUsd: 10_000, drops: 1 }, perk: "second launch slot" },
  { key: "hen", emoji: "🐔", name: "hen", slots: 3, needs: { holders: 500, volumeUsd: 100_000, followers: 10 }, perk: "third slot, family namespace" },
  { key: "eagle", emoji: "🦅", name: "eagle", slots: 99, needs: { holders: 2_000, volumeUsd: 1_000_000, feesUsd: 5_000 }, perk: "unlimited slots, can sponsor new agents" },
];

export type AgentStats = { holders: number; volumeUsd: number; feesUsd: number; drops: number; followers: number; days: number };

export type Level = { def: LevelDef; index: number; next: LevelDef | null; missing: string[] };

const LABEL: Record<keyof AgentStats, string> = { holders: "holders", volumeUsd: "volume", feesUsd: "fees", drops: "drops paid", followers: "followers", days: "days alive" };
const fmt = (k: keyof AgentStats, n: number) => (k === "volumeUsd" || k === "feesUsd" ? `$${n.toLocaleString()}` : n.toLocaleString());

/** The highest level whose every requirement the stats meet, and what the next one still needs. */
export function levelFor(s: AgentStats): Level {
  const meets = (d: LevelDef) => (Object.keys(d.needs) as (keyof AgentStats)[]).every((k) => s[k] >= (d.needs[k] ?? 0));
  let index = 0;
  for (let i = 0; i < LADDER.length; i++) if (meets(LADDER[i])) index = i;
  const next = LADDER[index + 1] ?? null;
  const missing = next ? (Object.keys(next.needs) as (keyof AgentStats)[]).filter((k) => s[k] < (next.needs[k] ?? 0)).map((k) => `${fmt(k, next.needs[k]!)} ${LABEL[k]} (${fmt(k, Math.floor(s[k]))})`) : [];
  return { def: LADDER[index], index, next, missing };
}
