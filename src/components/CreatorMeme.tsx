"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { PRIVY_ENABLED } from "@/lib/privy-client";
import { deleteMeme, updateMemeDetails, uploadMeme, type MemeAuth } from "@/lib/meme-client";
import { cleanMemeDetails, hasDetails, type MemeDetails } from "@/lib/meme-details";
import { MemePicker } from "./MemePicker";
import { MemeDetailsFields } from "./MemeDetailsFields";

type Props = { mojiId: string; combo: string; chainId: number; pair: string; creatorDid: string | null; creatorAddress: string | null; memeUrl: string | null; details: MemeDetails };

/**
 * On a token page: the creator's "add a picture" / "change picture" / "remove" control, plus the words and links
 * (description, X, Telegram, website) behind an "edit details" toggle. Renders nothing for everyone else.
 * The creator is the Privy user whose DID launched it (app launches) or the connected wallet that launched it
 * (wallet and agent launches, which sign a message instead).
 */
export function CreatorMeme(props: Props) {
  if (!PRIVY_ENABLED || (!props.creatorDid && !props.creatorAddress)) return null;
  return <CreatorMemeInner {...props} />;
}

function CreatorMemeInner({ mojiId, combo, chainId, pair, creatorDid, creatorAddress, memeUrl, details }: Props) {
  const router = useRouter();
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MemeDetails>(details);
  const [saved, setSaved] = useState(false);
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
    if (!confirm("Remove the picture? The token goes back to its emoji picture.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMeme(target, await auth(), mojiId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the picture");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const clean = cleanMemeDetails(draft);
    if (!clean.ok) {
      setError(clean.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await updateMemeDetails(target, clean.details, await auth(), mojiId);
      setDraft(next);
      setSaved(true);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
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
        {!busy && (
          <button type="button" onClick={() => setEditing((v) => !v)} className="press clay-pill heading bg-white px-3 py-2 text-[13px] text-ink-soft">
            {editing ? "close" : hasDetails(details) ? "edit details" : "add details"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mx-auto mt-1 flex w-full max-w-[400px] flex-col items-center gap-2">
          <MemeDetailsFields value={draft} onChange={setDraft} disabled={busy} />
          <button type="button" onClick={() => void onSave()} disabled={busy} className="press clay-pill heading bg-sky-500 px-5 py-2 text-[14px] text-white">
            {busy ? "…" : "save details"}
          </button>
        </div>
      )}
      {error && <p className="text-[12px] text-coral">{error}</p>}
      {saved && !error && !editing && <p className="text-[12px] text-mint">saved</p>}
      <p className="text-[11px] text-ink-soft">only you see this · png, jpg, gif or webp · a description and your X, Telegram and website{byWallet ? " · one wallet signature" : ""}</p>
    </div>
  );
}
