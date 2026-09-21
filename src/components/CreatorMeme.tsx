"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { deleteMeme, uploadMeme } from "@/lib/meme-client";
import { MemePicker } from "./MemePicker";

type Props = { combo: string; chainId: number; pair: string; creatorDid: string | null; memeUrl: string | null };

/** On a moji page: the creator's "add a meme" / "change meme" control. Renders nothing for everyone else. */
export function CreatorMeme(props: Props) {
  if (!PRIVY_ENABLED || !props.creatorDid) return null;
  return <CreatorMemeInner {...props} />;
}

function CreatorMemeInner({ combo, chainId, pair, creatorDid, memeUrl }: Props) {
  const router = useRouter();
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready || !authenticated || user?.id !== creatorDid) return null;
  const target = { combo, chainId, pair };

  async function onPick(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMeme(target, file, await getAccessToken());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!confirm("Remove the meme? The moji goes back to its emoji picture.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMeme(target, await getAccessToken());
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
        <MemePicker value={null} onChange={onPick} busy={busy} label={memeUrl ? "change meme" : "add a meme"} />
        {memeUrl && !busy && (
          <button type="button" onClick={() => void onRemove()} className="press clay-pill heading bg-white px-3 py-2 text-[13px] text-ink-soft">
            remove
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-coral">{error}</p>}
      <p className="text-[11px] text-ink-soft">only you see this · png, jpg, gif or webp</p>
    </div>
  );
}
