/**
 * The message a creator signs to have moji pay the gas for their launch. Shared by the browser (the app's launch
 * button on Robinhood Chain) and the server so the bytes match exactly. Keys in this order, JSON, one line:
 * chainId, combo, creator, feeRecipient (when set), name (memes), pair, ts.
 */
export function canonicalSponsorMessage(p: { creator: string; combo: string; pair: string; chainId: number; ts: number; name?: string | null; feeRecipient?: string | null }): string {
  return `moji sponsored launch v1\n${JSON.stringify({
    chainId: p.chainId,
    combo: p.combo,
    creator: p.creator.toLowerCase(),
    ...(p.feeRecipient ? { feeRecipient: p.feeRecipient.toLowerCase() } : {}),
    ...(p.name ? { name: p.name } : {}),
    pair: p.pair.toLowerCase(),
    ts: p.ts,
  })}`;
}
