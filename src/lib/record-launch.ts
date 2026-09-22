import "server-only";
import { supabaseServer } from "./supabase";
import { NETWORK, SITE_URL } from "./network";
import { storeMojiImage } from "./images";
import { refreshOne } from "./snapshot";
import { launchTweet, postTweet, X_AUTOPOST } from "./x";
import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import type { ComboValidation } from "./emoji";
import { memeCombo, memeDisplay } from "./memecoin";
import { mojiHref } from "./hrefs";

export type LaunchIdentity = { kind: "x" | "wallet" | "agent"; did: string | null; handle: string | null };

export type RecordInput = {
  /** the emoji combo (mojis); omitted for memes */
  v?: Extract<ComboValidation, { ok: true }>;
  /** MEME launch: name + ticker; the picture is uploaded right after through /api/mojis/[combo]/meme */
  meme?: { name: string; symbol: string };
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
  const { v, meme, chain, stock, who } = input;
  if (!v && !meme) return { ok: false, error: "nothing to record", code: "BAD_INPUT", status: 400 };
  const combo = meme ? memeCombo(chain.chainId, stock.address, meme.symbol) : v!.normalized;
  const display = meme ? memeDisplay(meme.symbol) : v!.display;
  const sb = supabaseServer();
  const { error: claimErr } = await sb.from("claims").insert({ combo, display, chain_id: chain.chainId, network: NETWORK, stock_address: stock.address });
  if (claimErr) {
    const conflict = claimErr.code === "23505";
    return { ok: false, error: conflict ? `${display} is already paired to ${stock.ticker} on ${chain.short}` : claimErr.message, code: conflict ? "CLAIMED" : "DB_ERROR", status: conflict ? 409 : 500 };
  }
  const metadataUrl = meme
    ? `${SITE_URL}/api/meta/meme/${encodeURIComponent(meme.symbol)}?chain=${chain.chainId}&pair=${stock.address}`
    : `${SITE_URL}/api/meta/${encodeURIComponent(display)}?chain=${chain.chainId}&pair=${stock.address}`;
  const row = {
    combo,
    display,
    ...(meme ? { kind: "meme", name: meme.name, symbol: meme.symbol } : {}),
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
  };
  let { data, error } = await sb.from("mojis").insert({ ...row, creator_kind: who.kind }).select("*").single();
  // Before supabase/agents.sql is applied the column does not exist (PGRST204): record the launch without it.
  if (error?.code === "PGRST204") ({ data, error } = await sb.from("mojis").insert(row).select("*").single());
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed", code: "DB_ERROR", status: 500 };

  // Token image: mojis get the rendered emoji circle; a meme gets a placeholder until its picture is uploaded
  // (the creator does that right after, through /api/mojis/[combo]/meme, which then mirrors it into image_url).
  let imageUrl: string | null = null;
  try {
    imageUrl = meme ? `${SITE_URL}/api/img/meme/${encodeURIComponent(meme.symbol)}` : await storeMojiImage(v!.display, v!.normalized);
    if (imageUrl) await sb.from("mojis").update({ image_url: imageUrl }).eq("id", data.id);
  } catch (e) {
    console.error("image store failed", e);
  }
  try {
    await refreshOne(data as never);
  } catch {}

  const href = mojiHref({ display, stock_ticker: stock.ticker, chain_id: chain.chainId, kind: meme ? "meme" : "moji", symbol: meme?.symbol ?? null });
  if (X_AUTOPOST) void postTweet(launchTweet({ display, stock_ticker: stock.ticker, creator_handle: who.handle, token_address: input.tokenAddress }, `${SITE_URL}${href}`)).catch(() => {});
  return { ok: true, moji: { ...(data as Record<string, unknown>), image_url: imageUrl }, href, url: `${SITE_URL}${href}` };
}
