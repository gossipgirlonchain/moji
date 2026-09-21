# Errors

Every error is `{ "error": "<human sentence>", "code": "<CODE>" }` with an HTTP status. Handle the code, show the sentence.

| code | status | meaning |
|---|---|---|
| `BAD_INPUT` | 400 | a parameter is missing or malformed |
| `BAD_JSON` | 400 | the body is not JSON |
| `BAD_COMBO` | 400 | not 1 to 3 emoji graphemes (no letters, digits, keycaps) |
| `PAIR_NOT_LISTED` | 400 | pair is not on the curated list for that chain |
| `CHAIN_NOT_LIVE` | 400 | chain is not launchable yet |
| `CLAIMED` | 409 | combo already paired there; `owner` links to it |
| `NO_SLOTS` | 429 | this wallet has used its launch slot; `quota.mojis` lists its mojis |
| `TX_NOT_FOUND` | 422 | receipt not indexed yet; retry the same body |
| `TX_NOT_VERIFIED` | 422 | the tx is not a moji launch by `creatorAddress` of `tokenAddress` against this pair |
| `NO_PRICE` | 502 | no USD price for the pair right now; retry |
| `NOT_FOUND` | 404 | that moji is not launched on that pair |
| `NO_ROUTE` | 400 | `via=eth` but no ETH path to that stock on that chain; use `via=stock` |
| `NO_POOL` | 500 | the pool key could not be rebuilt for this moji |
| `QUOTE_FAILED` | 502 | the quoter or router call failed; retry, or lower the amount |
| `BAD_RULES` | 400 | follow rules out of bounds |
| `BAD_SIGNATURE` | 403 | the signature does not match the canonical message |
| `STALE_SIGNATURE` | 400 | `ts` is more than 10 minutes from now |
| `NOT_A_LAUNCHER` | 404 | only a wallet that launched a moji can be followed or named |
| `TOO_MANY_FOLLOWS` | 429 | 20 follows per wallet |
| `BAD_NAME` | 400 | not 2 to 20 of a-z 0-9 _, or reserved |
| `NAME_TAKEN` | 409 | someone else has that name |
| `WALLET_CLAIMS_CLOSED` | 403 | wallet launches are switched off; only the app's X path works |
| `UNAUTHENTICATED` | 401 | a people-only route without a Privy token |
| `RATE_LIMITED` | 429 | the app's per-account cooldown; `retryAfterMinutes` |
| `SERVER_MISCONFIGURED` | 500 | a server setting is missing; not your fault |
| `DB_ERROR` | 500 | the database refused; retry |
