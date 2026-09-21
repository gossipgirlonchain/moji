/**
 * Dead-moji cap. A moji counts as dead once it is older than DEAD_MIN_AGE_MS and has under DEAD_VOLUME_USD of
 * all-time volume. A launcher holding DEAD_MAX dead mojis cannot launch another until one of them gets moving.
 * Rolling: the moment a moji crosses the volume line a slot opens. Nobody is banned.
 */
export const DEAD_MAX = 3;
export const DEAD_VOLUME_USD = 250;
export const DEAD_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Wallet claims (no X account). Any wallet can launch through the Airlock and record it with the tx hash; the
 * chain proves who sent it. A wallet's first moji is its identity (the agent IS 🍏🤖), so there is no dead-moji
 * rule on this path: nothing dies, a quiet moji is just quiet. Spam is held off by launch slots instead: every
 * wallet gets WALLET_LAUNCH_SLOTS launches.
 * Flip WALLET_CLAIMS_OPEN to false to require X again (the params endpoint and the record route both read it).
 */
export const WALLET_CLAIMS_OPEN = true;
export const WALLET_LAUNCH_SLOTS = 1;
