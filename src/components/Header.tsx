"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { AuthButton } from "./AuthButton";

export function Header() {
  return (
    <header className="mb-5 flex items-center justify-between">
      <Link href="/" className="press clay-sm flex items-center gap-2 bg-white px-3 py-2" style={{ borderRadius: 999 }}>
        <Image src="/moji.png" alt="moji" width={64} height={33} priority className="h-[26px] w-auto" />
      </Link>
      <nav className="flex items-center gap-2">
        <Link href="/explore" className="press clay-pill heading bg-sky-50 px-3.5 py-2 text-[14px] text-ink">
          explore
        </Link>
        <Link href="/leaderboard" aria-label="leaderboard" title="leaderboard" className="press clay-pill heading bg-sky-50 px-3 py-2 text-[14px] text-ink">
          🏆
        </Link>
        {PRIVY_ENABLED ? <AuthButton /> : <DisabledLogin />}
      </nav>
    </header>
  );
}

function DisabledLogin() {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 2200);
    return () => clearTimeout(t);
  }, [hint]);
  return (
    <div className="relative">
      <button onClick={() => setHint(true)} className="press clay-pill heading bg-sky-500 px-4 py-2 text-[14px] text-white">
        Log in
      </button>
      {hint && (
        <div className="clay-sm absolute right-0 top-11 z-20 w-56 bg-white p-3 text-[13px] text-ink-soft">
          Set NEXT_PUBLIC_PRIVY_APP_ID to enable login.
        </div>
      )}
    </div>
  );
}
