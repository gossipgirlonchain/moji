"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy, useSigners, useWallets } from "@privy-io/react-auth";
import { Card, Label } from "./ui";

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? "";
const POLICY_IDS = (process.env.NEXT_PUBLIC_PRIVY_POLICY_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * "Let moji trade for me": adds the moji signer to the user's embedded wallet so the copy engine (and later the X
 * bot) can send trades while they are away, inside the Privy policy attached to the signer. One tap on, one tap off.
 * Only embedded wallets can do this; external wallets never leave the user's device.
 */
export function DelegateCard() {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { addSigners, removeSigners } = useSigners();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const [state, setState] = useState<{ configured: boolean; delegated: { address: string } | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authenticated) return;
    const token = await getAccessToken();
    const r = await fetch("/api/me/delegate", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.ok) setState(await r.json());
  }, [authenticated, getAccessToken]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!authenticated || !SIGNER_ID) return null;
  const on = Boolean(state?.delegated);

  async function toggle() {
    if (!embedded) return;
    setError(null);
    try {
      const token = await getAccessToken();
      if (on) {
        setBusy("revoking");
        await removeSigners({ address: embedded.address });
        await fetch("/api/me/delegate", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      } else {
        setBusy("confirm in the wallet");
        await addSigners({ address: embedded.address, signers: [{ signerId: SIGNER_ID, policyIds: POLICY_IDS.length ? POLICY_IDS : undefined }] });
        setBusy("saving");
        const r = await fetch("/api/me/delegate", { method: "POST", headers: { authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "could not save");
      }
      await load();
    } catch (e) {
      const msg = String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e);
      setError(/rejected|denied|cancel/i.test(msg) ? "cancelled" : msg.slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card pop={2}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>Let moji trade for me</Label>
          <p className="mt-1 text-[13px] text-ink">
            {on ? "On. Trades you copy are sent from your wallet while you're away, inside the limits you set on each follow." : "Off. Copying the agents you follow needs this on, so moji can send from your wallet while you're away."}
          </p>
          {!embedded && <p className="mt-1 text-[12px] text-ink-soft">Only the embedded wallet from an X login can do this. External wallets stay on your device.</p>}
        </div>
        <button type="button" disabled={!embedded || !!busy || state === null} onClick={toggle} className={`press clay-pill heading shrink-0 px-4 py-2 text-[14px] disabled:opacity-50 ${on ? "bg-sky-50 text-ink" : "bg-sky-500 text-white"}`}>
          {busy ?? (on ? "turn off" : "turn on")}
        </button>
      </div>
      {error && <p className="mt-2 text-center text-[12px] text-coral">{error}</p>}
    </Card>
  );
}
