import "server-only";
import { supabaseServer } from "./supabase";
import { NETWORK, SITE_URL } from "./network";
import { storeMojiImage } from "./images";
import { refreshOne } from "./snapshot";
import { launchTweet, postTweet, X_AUTOPOST } from "./x";
import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import type { ComboValidation } from "./emoji";

export type LaunchIdentity = { kind: "x" | "wallet" | "agent"; did: string | null; handle: string | null };

export type RecordInput = {
  v: Extract<ComboValidation, { ok: true }>;
  /** a meme (title + ticker) instead of an emoji combo: stored as kind = 'meme', no rendered emoji image */
  meme?: { name: string; symbol: string } | null;
  chain: MojiChain;
  stock: Stock;
  tokenAddress: string;
  poolId?: string | null;
  txHash: string;
  supply?: string | null;
  creatorAddress: string;
  who: LaunchIdentity;
  /** the wallet that paid the gas when it was not the creator (sponsored launches) */
  sponsor?: string | null;
};

export type RecordResult = { ok: true; moji: Record<string, unknown>; href: string; url: string } | { ok: false; error: string; code: string; status: number };

/**
 * After the chain has been checked: insert the claim (the unique index is the permanence guarantee) and the moji
 * row, store the token image, snapshot the market, announce on X. Shared by the app path, the wallet path and
 * sponsored launches.
 */
export async function recordLaunch(input: RecordInput): Promise<RecordResult> {
  const { v, chain, stock, who } = input;
  const sb = supabaseServer();
  const { error: claimErr } = await sb.from("claims").insert({ combo: v.normalized, display: v.display, chain_id: chain.chainId, network: NETWORK, stock_address: stock.address });
  if (claimErr) {
    const conflict = claimErr.code === "23505";
    return { ok: false, error: conflict ? `${v.display} is already paired to ${stock.ticker} on ${chain.short}` : claimErr.message, code: conflict ? "CLAIMED" : "DB_ERROR", status: conflict ? 409 : 500 };
  }
  const metadataUrl = `${SITE_URL}/api/meta/${encodeURIComponent(v.display)}?chain=${chain.chainId}&pair=${stock.address}`;
  const row = {
    combo: v.normalized,
    display: v.display,
    network: NETWORK,
    chain_id: chain.chainId,
    stock_ticker: stock.ticker,
    stock_address: stock.address,
    token_address: input.tokenAddress,
    pool_id: input.poolId ?? null,
    tx_hash: input.txHash,
    supply: input.supply ?? null,
    creator_did: who.did,
    creator_handle: who.handle,
    creator_address: input.creatorAddress,
    metadata_url: metadataUrl,
    ...(input.meme ? { kind: "meme", name: input.meme.name, symbol: input.meme.symbol } : {}),
  };
  let { data, error } = await sb.from("mojis").insert({ ...row, creator_kind: who.kind }).select("*").single();
  // Before supabase/agents.sql is applied the column does not exist (PGRST204): record the launch without it.
  if (error?.code === "PGRST204") ({ data, error } = await sb.from("mojis").insert(row).select("*").single());
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed", code: "DB_ERROR", status: 500 };

  // A moji's token image is its rendered emoji. A meme's is the picture the creator uploads right after this.
  let imageUrl: string | null = null;
  if (!input.meme) {
    try {
      imageUrl = await storeMojiImage(v.display, v.normalized);
      if (imageUrl) await sb.from("mojis").update({ image_url: imageUrl }).eq("id", data.id);
    } catch (e) {
      console.error("image store failed", e);
    }
  }
  try {
    await refreshOne(data as never);
  } catch {}

  const href = `/m/${encodeURIComponent(v.display)}/${encodeURIComponent(stock.ticker)}${chain.chainId !== 4663 ? `/${chain.chainId}` : ""}`;
  if (X_AUTOPOST) void postTweet(launchTweet({ display: v.display, stock_ticker: stock.ticker, creator_handle: who.handle, token_address: input.tokenAddress }, `${SITE_URL}${href}`)).catch(() => {});
  return { ok: true, moji: { ...(data as Record<string, unknown>), image_url: imageUrl }, href, url: `${SITE_URL}${href}` };
}
