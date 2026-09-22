import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function hasSupabase(): boolean {
  return Boolean(url && (anon || service));
}

let _server: SupabaseClient | null = null;
/** Server-only client. Uses the service role key when present (writes), else anon (reads). */
export function supabaseServer(): SupabaseClient {
  if (!_server) {
    _server = createClient(url, service || anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _server;
}

export type MojiRow = {
  id: string;
  combo: string; // normalized
  display: string; // as typed (with skin tones / VS16 kept)
  chain_id: number;
  stock_ticker: string;
  stock_address: string;
  token_address: string | null;
  pool_id: string | null;
  tx_hash: string | null;
  supply: string | null;
  market_cap_usd: number | null;
  fees_claimed_usd: number | null;
  fees_unclaimed_usd: number | null;
  creator_did: string | null;
  creator_handle: string | null;
  creator_address: string | null;
  /** how the launch was recorded: "x" (Privy + linked X), "wallet" (tx hash only), "agent" (wallet that said it is an agent). supabase/agents.sql */
  creator_kind?: "x" | "wallet" | "agent" | null;
  network: "mainnet" | "testnet";
  price_usd: number | null;
  volume24_usd: number | null;
  volume1h_usd: number | null;
  volume6h_usd: number | null;
  volume_all_usd: number | null;
  volume7d_usd: number | null;
  volume30d_usd: number | null;
  txns_all: number | null;
  txns7d: number | null;
  txns30d: number | null;
  txns24: number | null;
  volume_all_at: string | null;
  fees_stock_pending: number | null;
  fees_moji_pending: number | null;
  fees_stock_claimed: number | null;
  fees_moji_claimed: number | null;
  fees_creator_stock_claimed: number | null;
  fees_creator_moji_claimed: number | null;
  fees_claim_count: number | null;
  fees_scanned_block: number | string | null;
  fees_total_usd: number | null;
  fee_current: number | null;
  snapshot_at: string | null;
  image_url: string | null;
  /** the picture (supabase/memes.sql): required for memes; image_url mirrors it while set */
  meme_url?: string | null;
  /** "moji" (emoji combo) or "meme" (name + ticker + picture), supabase/memecoins.sql */
  kind?: "moji" | "meme" | null;
  /** memes only */
  name?: string | null;
  symbol?: string | null;
  metadata_url: string | null;
  /** community link shown on the moji page, set per moji */
  telegram_url?: string | null;
  launched_at: string;
  /** creator drops (supabase/drops.sql) */
  holders_scanned_block?: number | string | null;
  holders_scanned_at?: string | null;
  holders_count?: number | null;
  drops_active?: boolean | null;
  drops_paid_usd?: number | null;
  rewards_badge?: boolean | null;
};

export type ClaimRow = {
  combo: string;
  display: string;
  chain_id: number;
  network: "mainnet" | "testnet";
  stock_address: string;
  created_at: string;
};
