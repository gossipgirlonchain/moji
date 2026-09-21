"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address } from "viem";
import { pickWallet } from "@/lib/wallet";
import { Card, Label } from "@/components/ui";

/** Same bytes as src/lib/agent-names.ts canonicalNameMessage. */
const message = (address: string, name: string, ts: number) => `moji name v1\n${JSON.stringify({ address: address.toLowerCase(), name, ts })}`;

/** Shown on an agent's own page: set or change the name people call you by. Signed with the wallet. */
export function NameCard({ agent, current }: { agent: string; current: string | null }) {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const [name, setName] = useState(current ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(current);
  if (!address || address.toLowerCase() !== agent.toLowerCase()) return null;

  async function save(value: string) {
    const wallet = wallets.find((w) => w.address.toLowerCase() === address!.toLowerCase()) ?? pickWallet(wallets);
    if (!wallet) return;
    setError(null);
    try {
      setBusy("sign");
      const provider = await wallet.getEthereumProvider();
      const wc = createWalletClient({ account: address as Address, transport: custom(provider) });
      const ts = Date.now();
      const clean = value.trim().toLowerCase().replace(/^@/, "");
      const signature = await wc.signMessage({ message: message(address!, clean, ts) });
      setBusy("saving");
      const r = await fetch("/api/agents/name", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, name: clean, ts, signature }) });
      const j = (await r.json()) as { error?: string; name?: string | null };
      if (!r.ok) throw new Error(j.error ?? "could not save");
      setSaved(j.name ?? null);
      setName(j.name ?? "");
      window.location.reload();
    } catch (e) {
      const msg = String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e);
      setError(/rejected|denied/i.test(msg) ? "cancelled" : msg.slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card tone="sky" pop={1}>
      <Label className="mb-2">Your name</Label>
      <div className="flex items-center gap-2">
        <span className="heading text-[15px] text-ink-soft">@</span>
        <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="frog_trader" className="clay-sm heading flex-1 bg-white px-3 py-2 text-[15px] text-ink outline-none" />
        <button type="button" disabled={!!busy || name.length < 2 || name === (saved ?? "")} onClick={() => save(name)} className="press clay heading bg-sky-500 px-4 py-2 text-[14px] text-white disabled:opacity-50">
          {busy ?? (saved ? "change" : "set name")}
        </button>
        {saved && (
          <button type="button" disabled={!!busy} onClick={() => save("")} className="press clay-pill heading bg-sky-50 px-3 py-2 text-[12px] text-ink disabled:opacity-50">
            clear
          </button>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-soft">lowercase letters, digits and underscore, 2 to 20 characters. unique. you sign it with your wallet.</p>
      {error && <p className="mt-2 text-center text-[12px] text-coral">{error}</p>}
    </Card>
  );
}
