"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount } from "wagmi";
import { MOJI_TREASURY } from "@/config/fees";
import { short } from "@/lib/format";
import { Label } from "./ui";

/**
 * Every wallet on this Privy account (embedded + any connected external ones), with the active one
 * highlighted. Claims and sends are signed by the active wallet, so this is how the treasury
 * MetaMask becomes the signer while staying logged in with X.
 */
export function WalletSwitcher({ compact }: { compact?: boolean }) {
  const { linkWallet } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const isTreasury = (a: string) => Boolean(MOJI_TREASURY) && a.toLowerCase() === MOJI_TREASURY.toLowerCase();

  return (
    <div>
      {!compact && <Label className="mb-1">Wallets</Label>}
      <div className="flex flex-col gap-1.5">
        {wallets.map((w) => {
          const active = address?.toLowerCase() === w.address.toLowerCase();
          return (
            <button
              key={w.address}
              type="button"
              onClick={() => void setActiveWallet(w)}
              data-pressed={active ? "true" : undefined}
              className={`press clay-sm flex items-center justify-between px-3 py-2 text-left ${active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}
            >
              <span className="mono text-[13px]">{short(w.address, 6, 4)}</span>
              <span className={`heading text-[11px] uppercase tracking-[0.1em] ${active ? "text-white/85" : "text-ink-soft"}`}>
                {isTreasury(w.address) ? "treasury · " : ""}
                {w.walletClientType === "privy" ? "embedded" : w.walletClientType}
                {active ? " · active" : ""}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={linkWallet} className="press clay-sm heading bg-white px-3 py-2 text-center text-[13px] text-sky-600">
          + connect another wallet
        </button>
      </div>
    </div>
  );
}
