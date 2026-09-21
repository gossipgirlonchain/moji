/**
 * Messages a wallet-path creator (no Privy DID: wallet and agent launches) signs to change a meme.
 * Shared by the route and the browser so the bytes match exactly.
 */
export const MEME_SIGNATURE_TTL_MS = 10 * 60 * 1000;

/** POST: bound to the picture itself (sha256 hex of the uploaded bytes), so a captured signature cannot put up another file. */
export const memeSetMessage = (mojiId: string, sha256Hex: string) => `moji meme ${mojiId} set ${sha256Hex}`;

/** DELETE: bound to a timestamp the server checks against MEME_SIGNATURE_TTL_MS. */
export const memeRemoveMessage = (mojiId: string, ts: number) => `moji meme ${mojiId} remove ${ts}`;
