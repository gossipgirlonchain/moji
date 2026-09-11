"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { mainnet, arbitrum, base } from "viem/chains";
import { useState } from "react";
import { SUPPORTED_EVM_CHAINS, robinhoodChain } from "@/config/chains";

/**
 * Privy + wagmi. No paymaster, no smart wallets, no gas sponsorship.
 * Users pay their own gas. Embedded wallets are plain EOAs.
 */
export const wagmiConfig = createConfig({
  chains: SUPPORTED_EVM_CHAINS,
  transports: {
    [robinhoodChain.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [mainnet.id]: http(),
  },
});

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!PRIVY_APP_ID) {
    // Still render the app so the pages work without auth configured.
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["twitter", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        supportedChains: [...SUPPORTED_EVM_CHAINS],
        defaultChain: robinhoodChain,
        appearance: {
          theme: "light",
          accentColor: "#4AA8E6",
          logo: "/moji.png",
          walletList: ["detected_wallets", "metamask", "coinbase_wallet", "wallet_connect", "rainbow"],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
