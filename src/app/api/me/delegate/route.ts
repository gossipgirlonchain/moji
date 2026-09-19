import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy-server";
import { DELEGATION_CONFIGURED, POLICY_IDS, SIGNER_ID, delegatedWallet, recordDelegation, removeDelegation } from "@/lib/delegated";

export const dynamic = "force-dynamic";

/**
 * Delegated signing for the logged-in user (Privy bearer).
 *  GET    → { configured, signerId, policyIds, delegated: { address } | null }
 *  POST   → after the client added the signer, record the wallet so the copy engine can send from it
 *  DELETE → after the client removed the signer, forget it
 */
async function who(req: Request) {
  const v = await verifyPrivyToken(req.headers.get("authorization"));
  return v && v !== "unconfigured" ? v.did : null;
}

export async function GET(req: Request) {
  const did = await who(req);
  if (!did) return NextResponse.json({ error: "Not logged in", code: "UNAUTHENTICATED" }, { status: 401 });
  const w = await delegatedWallet(did);
  return NextResponse.json({ configured: DELEGATION_CONFIGURED && Boolean(SIGNER_ID), signerId: SIGNER_ID || null, policyIds: POLICY_IDS, delegated: w ? { address: w.address } : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const did = await who(req);
  if (!did) return NextResponse.json({ error: "Not logged in", code: "UNAUTHENTICATED" }, { status: 401 });
  const row = await recordDelegation(did);
  if (!row) return NextResponse.json({ error: "No delegated embedded wallet on this account yet", code: "NOT_DELEGATED" }, { status: 400 });
  return NextResponse.json({ ok: true, address: row.address });
}

export async function DELETE(req: Request) {
  const did = await who(req);
  if (!did) return NextResponse.json({ error: "Not logged in", code: "UNAUTHENTICATED" }, { status: 401 });
  await removeDelegation(did);
  return NextResponse.json({ ok: true });
}
