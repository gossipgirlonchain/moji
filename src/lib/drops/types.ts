export type TokenKind = "moji" | "stock";
export type Split = "prorata" | "equal";
export type CampaignStatus = "draft" | "running" | "done" | "ended" | "failed";

export type CampaignRow = {
  id: string;
  moji_id: string;
  chain_id: number;
  network: string;
  creator_address: string;
  token_kind: TokenKind;
  token_address: string;
  token_decimals: number;
  token_symbol: string;
  amount: number;
  amount_wei: string;
  top_n: number;
  days: number;
  hold_days: number;
  min_hold: number;
  min_hold_wei: string;
  min_payout_usd: number;
  split: Split;
  cap_bps: number;
  cut_hour_utc: number;
  excluded: string[];
  signed_message: string | null;
  signature: string | null;
  status: CampaignStatus;
  onchain_id: number | string | null;
  fund_tx: string | null;
  funded_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  reclaim_after: string | null;
  next_cut_at: string | null;
  rounds_paid: number;
  paid_wei: string;
  paid_usd: number;
  end_tx: string | null;
  created_at: string;
};

export type RoundRow = {
  id: string;
  campaign_id: string;
  moji_id: string;
  round_no: number;
  cut_at: string;
  block: number | string | null;
  pot_wei: string;
  paid_wei: string;
  paid_usd: number;
  eligible: number;
  recipients: number;
  skipped: number;
  threshold_wei: string | null;
  token_price_usd: number | null;
  tx_hash: string | null;
  status: "pending" | "paid" | "skipped" | "failed";
  error: string | null;
};

export type PayoutRow = {
  round_id: string;
  campaign_id: string;
  moji_id: string;
  address: string;
  rank: number;
  held_wei: string;
  amount_wei: string;
  amount_usd: number;
};

/** The rules a creator signs. Everything a round needs is in here; nothing changes after funding. */
export type CampaignRules = {
  v: 1;
  moji: string; // display combo
  mojiId: string;
  chainId: number;
  token: TokenKind;
  tokenAddress: string;
  amount: string; // whole units as typed
  topN: number;
  days: number;
  holdDays: number;
  minHold: string; // whole moji tokens
  minPayoutUsd: number;
  split: Split;
  capBps: number;
  cutHourUtc: number;
  excluded: string[];
};

/** Limits the form and the API both enforce. All configurable per campaign within these bounds. */
export const CAMPAIGN_LIMITS = {
  topN: { min: 1, max: 5000 },
  days: { min: 1, max: 365 },
  holdDays: { min: 0, max: 365 },
  minPayoutUsd: { min: 0, max: 1000 },
  capBps: { min: 0, max: 10000 },
} as const;

export function canonicalRulesMessage(r: CampaignRules): string {
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(r).sort()) ordered[k] = (r as Record<string, unknown>)[k];
  return `moji drops v1\n${JSON.stringify(ordered)}`;
}
