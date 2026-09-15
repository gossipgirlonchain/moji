export type TokenKind = "moji" | "stock";
export type Split = "prorata" | "equal";
export type DropStatus = "draft" | "sending" | "sent" | "cancelled";

/** One drop: rules + the ranking it was cut on + sending progress. */
export type DropRow = {
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
  fee_bps: number;
  fee_wei: string;
  fee_tx: string | null;
  top_n: number;
  hold_days: number;
  min_hold: number;
  min_hold_wei: string;
  min_payout_usd: number;
  split: Split;
  cap_bps: number;
  excluded: string[];
  signed_message: string | null;
  signature: string | null;
  cut_at: string;
  eligible: number;
  recipients: number;
  threshold_wei: string | null;
  token_price_usd: number | null;
  status: DropStatus;
  sent_count: number;
  sent_wei: string;
  sent_usd: number;
  completed_at: string | null;
  created_at: string;
};

export type PayoutRow = {
  drop_id: string;
  moji_id: string;
  address: string;
  rank: number;
  held_wei: string;
  amount_wei: string;
  amount_usd: number;
  tx_hash: string | null;
  sent_at: string | null;
  error: string | null;
};

/** The rules a creator signs. The ranking is cut from these the moment the drop is created. */
export type DropRules = {
  v: 2;
  moji: string; // display combo
  mojiId: string;
  chainId: number;
  token: TokenKind;
  tokenAddress: string;
  amount: string; // whole units to holders, as typed
  topN: number;
  holdDays: number;
  minHold: string; // whole moji tokens
  minPayoutUsd: number;
  split: Split;
  capBps: number;
  excluded: string[];
};

/** Limits the form and the API both enforce. Everything inside them is the creator's call. */
export const DROP_LIMITS = {
  topN: { min: 1, max: 2000 },
  holdDays: { min: 0, max: 365 },
  minPayoutUsd: { min: 0, max: 1000 },
  capBps: { min: 0, max: 10000 },
} as const;

export function canonicalRulesMessage(r: DropRules): string {
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(r).sort()) ordered[k] = (r as Record<string, unknown>)[k];
  return `moji drops v2\n${JSON.stringify(ordered)}`;
}
