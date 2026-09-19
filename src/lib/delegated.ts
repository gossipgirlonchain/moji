import "server-only";
import { toHex, type Address, type Hex } from "viem";
import { linkedAccounts, privyClient } from "./privy-server";
import { hasSupabase, supabaseServer } from "./supabase";
import { NETWORK } from "./network";

/**
 * Delegated signing: the moji authorization key may send transactions from a user's Privy embedded wallet once
 * the user added the signer to it (useSigners().addSigners on /profile). Privy enforces the policy attached to
 * the signer; this module only asks. Inert until PRIVY_AUTHORIZATION_KEY is set.
 */
const AUTH_KEY = process.env.PRIVY_AUTHORIZATION_KEY ?? "";
export const DELEGATION_CONFIGURED = Boolean(AUTH_KEY && process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);
/** The signer id and policy ids the client adds to the wallet (public: they are not secrets). */
export const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? "";
export const POLICY_IDS = (process.env.NEXT_PUBLIC_PRIVY_POLICY_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export type Delegation = { address: string; did: string; wallet_id: string; network: string; created_at: string };

/** The user's embedded ethereum wallet that is currently delegated, as Privy sees it. */
export async function delegatedWallet(did: string): Promise<{ address: string; walletId: string } | null> {
  const accounts = await linkedAccounts(did);
  if (!accounts) return null;
  const w = accounts.find((a) => a.type === "wallet" && (a.chain_type ?? "ethereum") === "ethereum" && (a.wallet_client_type === "privy" || a.connector_type === "embedded") && a.delegated && a.id);
  return w?.id ? { address: w.address.toLowerCase(), walletId: w.id } : null;
}

/** Called after the user added the signer: store the wallet id so the copy engine can find it by address. */
export async function recordDelegation(did: string): Promise<Delegation | null> {
  if (!hasSupabase()) return null;
  const w = await delegatedWallet(did);
  if (!w) return null;
  const row = { address: w.address, did, wallet_id: w.walletId, network: NETWORK };
  const { data } = await supabaseServer().from("delegations").upsert(row, { onConflict: "address" }).select("*").single();
  return (data as Delegation) ?? null;
}

export async function removeDelegation(did: string): Promise<void> {
  if (!hasSupabase()) return;
  await supabaseServer().from("delegations").delete().eq("did", did);
}

export async function delegationFor(address: string): Promise<Delegation | null> {
  if (!hasSupabase()) return null;
  const { data } = await supabaseServer().from("delegations").select("*").eq("address", address.toLowerCase()).maybeSingle();
  return (data as Delegation) ?? null;
}

/** Send a prepared transaction from a delegated wallet. Throws when delegation is not configured or Privy refuses. */
export async function sendFromDelegated(d: Delegation, tx: { chainId: number; to: Address; data: Hex; value?: bigint }): Promise<Hex> {
  const p = privyClient();
  if (!p || !DELEGATION_CONFIGURED) throw new Error("delegated signing is not configured");
  const res = await p
    .wallets()
    .ethereum()
    .sendTransaction(d.wallet_id, {
      caip2: `eip155:${tx.chainId}`,
      params: { transaction: { to: tx.to, data: tx.data, value: toHex(tx.value ?? 0n), chain_id: toHex(tx.chainId) } },
      authorization_context: { authorization_private_keys: [AUTH_KEY] },
    } as never);
  return (res as { hash: string }).hash as Hex;
}
