"use client";

import { numberToHex, type Chain, type EIP1193Provider } from "viem";
import type { ConnectedWallet } from "@privy-io/react-auth";

/**
 * Make sure a Privy wallet's provider is actually on `chain` before we build a transaction with it.
 * Privy's wallet.switchChain can resolve before the provider reports the new chain, and external
 * wallets may need the chain added first. Returns a provider that answers eth_chainId with chain.id.
 */
export async function ensureChain(wallet: ConnectedWallet, chain: Chain): Promise<EIP1193Provider> {
  const want = chain.id;
  const hex = numberToHex(want);
  const read = async (p: EIP1193Provider) => Number(await p.request({ method: "eth_chainId" }));

  try {
    await wallet.switchChain(want);
  } catch {}
  let provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
  if ((await read(provider)) === want) return provider;

  // Ask the provider directly, adding the chain if the wallet doesn't know it.
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4902 || /unrecognized|not added|4902/i.test(String((e as Error).message))) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
          },
        ],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } else {
      throw e;
    }
  }

  // Poll: some providers flip asynchronously.
  for (let i = 0; i < 20; i++) {
    provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
    if ((await read(provider)) === want) return provider;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`switch your wallet to ${chain.name} and try again.`);
}
