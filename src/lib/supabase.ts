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
  network: "mainnet" | "testnet";
  image_url: string | null;
  metadata_url: string | null;
  launched_at: string;
};

export type ClaimRow = {
  combo: string;
  display: string;
  chain_id: number;
  network: "mainnet" | "testnet";
  created_at: string;
};
