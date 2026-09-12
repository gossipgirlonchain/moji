"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount, useBalance } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { CHAINS, type MojiChain } from "@/config/chains";
import { chainLaunchable } from "@/lib/numeraire";
import { short } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { pickWallet } from "@/lib/wallet";
import Link from "next/link";

function ChainBalance({ chain, address }: { chain: MojiChain; address: `0x${string}` }) {
  const { data } = useBalance({ address, chainId: chain.viem!.id, query: { enabled: Boolean(address), refetchInterval: 20_000 } });
  const v = data ? Number(formatUnits(data.value, data.decimals)) : 0;
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-ink-soft">
        {chain.emoji} {chain.short}
      </span>
      <span className={`num ${v > 0 ? "text-ink" : "text-ink-soft"}`}>
        {v.toFixed(5)} {chain.gasSymbol}
      </span>
    </div>
  );
}

/** Deterministic sky-toned dot for wallet-only users. */
function dotColor(addr: string): string {
  let h = 0;
  for (const ch of addr.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = 195 + (h % 30); // sky band
  const light = 55 + ((h >> 8) % 15);
  return `hsl(${hue} 75% ${light}%)`;
}

export function AuthButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const [open, setOpen] = useState(false);

  // Prefer an external wallet if connected, else the embedded one.
  const primary = useMemo(() => pickWallet(wallets), [wallets]);

  // Only pick a default once; never override a wallet the user switched to.
  useEffect(() => {
    if (primary && authenticated && !address) void setActiveWallet(primary);
  }, [primary, authenticated, address, setActiveWallet]);


  if (!ready) {
    return <div className="clay-pill h-9 w-20 animate-pulse bg-sky-50" />;
  }

  if (!authenticated) {
    return (
      <button onClick={login} className="press clay-pill heading bg-sky-500 px-4 py-2 text-[14px] text-white">
        Log in
      </button>
    );
  }

  const handle = user?.twitter?.username ?? null;
  const avatar = user?.twitter?.profilePictureUrl?.replace("_normal", "") ?? null;
  const addr = address ?? primary?.address ?? "";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="press clay-pill flex items-center gap-2 bg-white py-1 pl-1 pr-3"
        aria-expanded={open}
      >
        <span className="clay-sm flex h-8 w-8 items-center justify-center overflow-hidden bg-sky-50" style={{ borderRadius: 999 }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-8 w-8 object-cover" style={{ borderRadius: 999 }} />
          ) : (
            <span className="block h-4 w-4" style={{ borderRadius: 999, background: dotColor(addr || "0x") }} />
          )}
        </span>
        <span className="heading text-[14px] text-ink">{handle ? `@${handle}` : short(addr)}</span>
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-label="close" onClick={() => setOpen(false)} />
          <div className="clay pop absolute right-0 top-12 z-20 w-[280px] bg-white p-4">
            <div className="heading mb-1 text-[12px] uppercase tracking-[0.12em] text-ink-soft">Wallet</div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="mono break-all text-[14px]">{short(addr, 6, 6)}</span>
              <CopyButton text={addr} />
            </div>
            <div className="heading mb-1 text-[12px] uppercase tracking-[0.12em] text-ink-soft">Gas balances</div>
            <div className="mb-4 flex flex-col gap-1">
              {CHAINS.filter((c) => chainLaunchable(c)).map((c) => (
                <ChainBalance key={c.key} chain={c} address={addr as `0x${string}`} />
              ))}
            </div>
            <Link href="/profile" onClick={() => setOpen(false)} className="press clay-sm heading mb-2 block w-full bg-sky-500 px-4 py-2.5 text-center text-[15px] text-white">
              profile · send
            </Link>
            <Link href="/me" onClick={() => setOpen(false)} className="press clay-sm heading mb-2 block w-full bg-sky-50 px-4 py-2.5 text-center text-[15px] text-ink">
              your mojis + fees
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="press clay-sm heading w-full bg-sky-50 px-4 py-2.5 text-[15px] text-ink"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
