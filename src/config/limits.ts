/**
 * Dead-moji cap. A moji counts as dead once it is older than DEAD_MIN_AGE_MS and has under DEAD_VOLUME_USD of
 * all-time volume. A launcher holding DEAD_MAX dead mojis cannot launch another until one of them gets moving.
 * Rolling: the moment a moji crosses the volume line a slot opens. Nobody is banned.
 */
export const DEAD_MAX = 3;
export const DEAD_VOLUME_USD = 250;
export const DEAD_MIN_AGE_MS = 24 * 60 * 60 * 1000;
