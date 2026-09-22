"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { deleteMeme, uploadMeme, type MemeAuth } from "@/lib/meme-client";
import { MemePicker } from "./MemePicker";

type Props = { mojiId: string; combo: string; chainId: number; pair: string; creatorDid: string | null; creatorAddress: string | null; memeUrl: string | null };

/**
 * On a moji page: the creator's "add a meme" / "change meme" / "remove" control. Renders nothing for everyone else.
 * The creator is the Privy user whose DID launched it (app launches) or the connected wallet that launched it
 * (wallet and agent launches, which sign a message instead).
 */
export function CreatorMeme(props: Props) {
  if (!PRIVY_ENABLED || (!props.creatorDid && !props.creatorAddress)) return null;
  return <CreatorMemeInner {...props} />;
}

function CreatorMemeInner({ mojiId, combo, chainId, pair, creatorDid, creatorAddress, memeUrl }: Props) {
  const router = useRouter();
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready || !authenticated) return null;
  const byDid = Boolean(creatorDid) && user?.id === creatorDid;
  const byWallet = !creatorDid && Boolean(address && creatorAddress) && address!.toLowerCase() === creatorAddress!.toLowerCase();
  if (!byDid && !byWallet) return null;
  const target = { combo, chainId, pair };

  async function auth(): Promise<MemeAuth> {
    if (byDid) {
      const token = await getAccessToken();
      return token ? { token } : null;
    }
    return { signer: address!, sign: (message) => signMessageAsync({ message }) };
  }

  async function onPick(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMeme(target, file, await auth(), mojiId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!confirm("Remove the picture? The meme shows its ticker until you add another.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMeme(target, await auth(), mojiId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the meme");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <MemePicker value={null} onChange={onPick} busy={busy} label={memeUrl ? "change picture" : "add a picture"} />
        {memeUrl && !busy && (
          <button type="button" onClick={() => void onRemove()} className="press clay-pill heading bg-white px-3 py-2 text-[13px] text-ink-soft">
            remove
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-coral">{error}</p>}
      <p className="text-[11px] text-ink-soft">only you see this · png, jpg, gif or webp{byWallet ? " · one wallet signature" : ""}</p>
    </div>
  );
}
