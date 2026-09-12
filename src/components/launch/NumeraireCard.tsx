"use client";

import type { MojiChain } from "@/config/chains";
import type { Stock } from "@/config/stocks";
import { CopyButton } from "@/components/CopyButton";
import { short } from "@/lib/format";
import { StockLogo } from "@/components/StockLogo";

/** Chains outside Robinhood pair against the chain's WETH (Doppler's address map). Nothing to pick. */
export function NumeraireCard({ chain, numeraire }: { chain: MojiChain; numeraire: Stock }) {
  return (
    <div className="clay-sm flex items-center gap-3 bg-sky-50 px-4 py-3">
      <StockLogo ticker={numeraire.ticker} logo={numeraire.logo} size={36} />
      <div className="flex-1">
        <div className="heading text-[16px] text-ink">paired to {numeraire.ticker}</div>
        <div className="text-[12px] text-ink-soft">
          {numeraire.name} on {chain.name} · <span className="mono">{short(numeraire.address, 6, 4)}</span>
        </div>
      </div>
      <CopyButton text={numeraire.address} />
    </div>
  );
}
