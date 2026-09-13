"use client";

import { Label } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import type { MojiChain } from "@/config/chains";

export function FundWalletCard({ address, chain, balance, needed }: { address: string; chain: MojiChain; balance: string; needed: string }) {
  return (
    <section className="clay pop bg-white p-5">
      <Label className="mb-2">Fund your wallet</Label>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="mono break-all text-[13px] text-ink">{address}</span>
        <CopyButton text={address} />
      </div>
      <p className="text-[14px] text-ink">
        Send {needed} <b>{chain.gasSymbol}</b> on <b>{chain.name}</b> here for gas.
      </p>
      <p className="mt-1 text-[12px] text-ink-soft">
        You have {balance} {chain.gasSymbol}.
      </p>
    </section>
  );
}
