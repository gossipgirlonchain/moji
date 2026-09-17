---
name: moji
description: Launch and run emoji tokens on moji.wtf from a wallet, no browser and no X account. Pick a 1 to 3 emoji combo, pair it to a tokenized stock or a token, send one Doppler Airlock transaction, record it with the tx hash. Read markets, fees and holders as JSON; drop rewards to holders with a wallet signature.
---

# moji for agents

moji.wtf is a launcher, not an exchange. A **moji** is a 1 to 3 emoji combo (🍏, 🍏💻 and 💻🍏 are three
different claims) paired to a real tokenized stock or token, launched as a Doppler multicurve pool. Once a combo is
claimed on a pair it is gone forever. Trading happens on Matcha and Dexscreener, never on moji.

Everything here is a plain HTTPS JSON API. There is nothing to moderate: the only content a launcher supplies is the
emoji combo, and the server rejects anything that is not 1 to 3 emoji graphemes. **Your wallet is your identity.**
Humans in the app sign in with X; you do not need to.

Base URL: `https://moji.wtf`. This file is served at `https://moji.wtf/skill.md`.

## What it costs, what you get

- **Gas only.** One `create` call on Doppler's Airlock, about 3.1M gas on Robinhood Chain (chain id 4663, gas in
  ETH). Gas is never sponsored. `GET /api/launch/params` returns the estimate and a floor.
- **You earn 70% of every swap fee** on your moji's pool, in the paired token and in the moji, forever. 25% goes to
  the moji treasury, 5% to the Doppler protocol. The pool's fee starts at 75% and decays to 1% over the first 16
  seconds (snipers pay), then stays at 1%.
- **Supply** 1,000,000,000, all of it on the curve from a $5,000 launch market cap (override with `mcap`, 1,000 to
  10,000,000 USD). No allocation to you: buy on the market like anyone else.

## Caps (per wallet)

- One launch per wallet per **60 minutes**.
- **Dead-moji cap:** once **2** of your mojis are older than a day with under **$250** all-time volume, you cannot
  launch another until one of them gets moving. Rolling, nobody is banned. `GET /api/claims/quota?creator=0x…`
  tells you where you stand.
- The combo must be free on that exact pair (combo + chain + numeraire). `GET /api/claims/check` before you spend gas;
  `GET /api/launch/params` refuses with `CLAIMED` too.

## Launch flow

1. **Pick a pair.** `GET /api/pairs` lists every live chain and what it can pair against there, by ticker and
   address. Only listed pairs are accepted.
2. **Pick a combo.** `GET /api/claims/check?combo=🍏🤖&chainId=4663&pair=<pairAddress>` →
   `{ valid, normalized, claimed, owner?, suggestions[] }`. Suggestions are free 3-emoji extensions when yours is taken.
3. **Get the transaction.** `GET /api/launch/params?combo=🍏🤖&pair=AAPL&creator=<yourAddress>[&chainId=4663][&mcap=5000]`
   → `tx { chainId, from, to, data, value, gas }`, `predicted { tokenAddress, poolId }`, `gas { costNative, minNative }`,
   `then.record.body`. The calldata is exactly what the app signs: Doppler Airlock `create` with moji's fee hook,
   beneficiaries and integrator. A fresh salt per call, so `predicted` is only valid for this `data`.
4. **Send it from `creator`.** The tx sender must be `creator` (the record step checks `receipt.from`). Wait for the
   receipt. If you change anything in `data` the record step rejects it.
5. **Record it.** `POST /api/launch` with `then.record.body` and `txHash` filled in, no `Authorization` header:
   ```json
   { "combo": "🍏🤖", "chainId": 4663, "stockAddress": "0x…", "tokenAddress": "0x…", "poolId": "0x…",
     "txHash": "0x…", "supply": "1000000000", "creatorAddress": "0x…", "agent": true }
   ```
   → `{ moji, href, url, creatorKind }`. The server reads the tx, checks it is a moji-shaped launch of this token
   against this pair by this sender, inserts the claim (a unique index is the permanence guarantee), renders the
   token image and metadata. `agent: true` marks the moji 🤖 on the site. If the tx is not indexed yet you get
   `TX_NOT_FOUND` (422): wait a few seconds and retry the same body; recording is idempotent on failure and a
   second success is impossible (409 `CLAIMED`).
6. **Tell people.** Your page is `then.page`. The site's share text is
   `{combo} paired to ${TICKER} on @mojidotwtf 🫡` plus the contract address and the page link.

Minimal viem sketch (Node):

```ts
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const account = privateKeyToAccount(process.env.KEY as `0x${string}`);
const p = await (await fetch(`https://moji.wtf/api/launch/params?combo=${encodeURIComponent("🍏🤖")}&pair=AAPL&creator=${account.address}`)).json();
if (!p.ok) throw new Error(`${p.code}: ${p.error}`);
const chain = { id: p.chain.id, name: p.chain.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } };
const wallet = createWalletClient({ account, chain, transport: http() }).extend(publicActions);
const hash = await wallet.sendTransaction({ to: p.tx.to, data: p.tx.data, value: BigInt(p.tx.value), gas: p.tx.gas ? BigInt(p.tx.gas) : undefined });
await wallet.waitForTransactionReceipt({ hash });
const r = await (await fetch("https://moji.wtf/api/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...p.then.record.body, txHash: hash }) })).json();
console.log(r.url);
```

Robinhood Chain's public RPC rejects requests without a `User-Agent` header; set one.

## Endpoints

Read (no auth, JSON):

| endpoint | what |
|---|---|
| `GET /api/pairs[?chainId=]` | live chains and their listed stocks and tokens (ticker, address, decimals) |
| `GET /api/claims/check?combo=&chainId=&pair=` | is this combo free on this pair; owner and suggestions when not |
| `GET /api/claims/quota?creator=0x…` | your wallet's dead-moji standing: `{ dead, max, blocked, message, deadCombos }` |
| `GET /api/claims/count` | combos claimed so far |
| `GET /api/claims/singles?chainId=&pair=` | single-emoji combos already taken on a pair |
| `GET /api/mojis?sort=newest\|mcap\|fees\|volume&window=1h\|6h\|24h\|all&q=` | every moji with its snapshot: price, market cap, volumes, fees, creator, `creator_kind` |
| `GET /api/mojis/{combo}?pair=&chain=` … see below | per-moji routes; `{combo}` is the URL-encoded display combo, `pair` the ticker, `chain` the id (Robinhood is the default) |
| `GET /api/mojis/{combo}/fees?pair=&chain=` | live pending fees for the creator (pool + hook, per token and USD), the fee schedule, market |
| `GET /api/mojis/{combo}/chart?pair=&chain=&range=1H\|4H\|1D\|7D\|ALL` | price series |
| `GET /api/mojis/{combo}/holders?pair=&chain=` | holder count, top-10 share, buckets, top 20 with held-since |
| `GET /api/meta/{combo}?chain=&pair=` | the on-chain `tokenURI` JSON (name, symbol, image, external_url) |
| `GET /api/img/{combo}` | the 512x512 token image (PNG) |
| `GET /api/price?ticker=AAPL` | USD price of a listed stock; `?chain=<dexscreener slug>&address=` for tokens |
| `GET /api/resolve?handle=` | wallet of an X launcher; `?list=1` for all launchers with handles |

Write (wallet path, no auth header; the chain or a wallet signature is the proof):

| endpoint | proof | what |
|---|---|---|
| `GET /api/launch/params` | none | assemble the launch tx for `creator` (refuses early: `CLAIMED`, `DEAD_CAP`, `PAIR_NOT_LISTED`, `BAD_COMBO`) |
| `POST /api/launch` | tx hash | record a launch (rules above) |
| `POST /api/mojis/{combo}/claimed` `{ txHashes[] }` | receipts | after you collect fees on-chain, record it so your earned total shows |
| `GET /api/mojis/{combo}/drops/preview?…` | none | who a drop would pay under a rule set, and the fee |
| `POST /api/mojis/{combo}/drops` `{ rules, signature, signer }` | `personal_sign` | cut a drop (below) |
| `POST /api/mojis/{combo}/drops/{id}/sent` `{ txHashes[] }` | receipts | mark payouts sent from their receipts |
| `POST /api/mojis/{combo}/drops/{id}/cancel` `{ signature, signer }` | signs `cancel drop <id>` | close a half-sent drop |
| `POST /api/mojis/{combo}/drops/badge` `{ on, signature, signer }` | signs `rewards badge <mojiId> on\|off` | toggle the 🪂 marker (after one drop) |

Humans use the same `POST /api/launch` with a Privy bearer token and a linked X account (15-minute cooldown, dead cap
3). That path is the app's, not yours.

## Collecting your fees

Fees accrue on-chain in two places and nothing is held by moji. Read them with `GET /api/mojis/{combo}/fees`. To
collect, from the creator wallet: call `collectFees()` on the MulticurvePool (the pool address is in `fees`), then
`claimFees(poolId)` on the RehypeDopplerHookInitializer (Doppler's address for the chain). Both transfer the paired
token and the moji straight to you as ERC-20s. Then `POST /api/mojis/{combo}/claimed { txHashes }` so the site's
totals include it. The Doppler SDK (`@whetstone-research/doppler-sdk`) wraps both calls.

## Drops: reward your holders

A drop is you sending a set amount of your moji (or of the paired token) to the holders who stick around, as plain
ERC-20 transfers from your wallet, one per holder. No contract, no escrow. moji ranks the holders and records what
landed; a 0.5% processing fee on what goes to holders is one extra transfer to the treasury.

1. `GET /api/mojis/{combo}/holders?pair=&chain=` once, so the holder index is warm.
2. `GET /api/mojis/{combo}/drops/preview?pair=&chain=&token=moji|stock&amount=…&topN=…&holdDays=…&minHold=…&minPayoutUsd=2&split=prorata|equal&capBps=…`
   → payouts, eligible count, fee.
3. Build the rules object exactly as the preview validated it:
   `{ v: 2, moji, mojiId, chainId, token, tokenAddress, amount, topN, holdDays, minHold, minPayoutUsd, split, capBps, excluded[] }`
   (`mojiId` and `tokenAddress` come from `GET /api/mojis`). Sign, with `personal_sign` (EIP-191) from the creator
   wallet, the canonical message: `"moji drops v2\n" + JSON.stringify(rules with keys sorted)`.
4. `POST /api/mojis/{combo}/drops?pair=&chain=` `{ rules, signature, signer }` → `{ drop, payouts[] }` with one row per
   recipient (`address`, `amount_wei`).
5. Send one `transfer(address, amount_wei)` per payout from your wallet, then the fee transfer (`drop.fee_wei` to the
   treasury address in the response), and post the hashes in batches to `POST …/drops/{id}/sent { txHashes }`.
   Amounts are read from the receipts. A half-sent drop can be resumed from `GET …/drops/{id}`.

Wallets ranked on a drop are ranked on the smallest balance they held across the whole hold window, so a wallet that
bought this morning does not count for a 3-day rule.

## Errors

Every error is `{ error, code }` with an HTTP status. Codes you should handle:

| code | status | meaning |
|---|---|---|
| `BAD_COMBO` | 400 | not 1 to 3 emoji graphemes (no letters, digits, keycaps) |
| `PAIR_NOT_LISTED` | 400 | pair is not on the curated list for that chain |
| `CHAIN_NOT_LIVE` | 400 | chain is not launchable yet |
| `CLAIMED` | 409 | combo already paired there; `owner` links to it |
| `DEAD_CAP` | 429 | dead-moji cap; `quota.deadCombos` says which ones need volume |
| `RATE_LIMITED` | 429 | cooldown; `retryAfterMinutes` |
| `TX_NOT_FOUND` | 422 | receipt not indexed yet; retry |
| `TX_NOT_VERIFIED` | 422 | the tx is not a moji launch by `creatorAddress` of `tokenAddress` against this pair |
| `NO_PRICE` | 502 | no USD price for the pair right now; retry |
| `WALLET_CLAIMS_CLOSED` | 403 | wallet launches are switched off; only the app's X path works |

## Rules of the namespace

- Graphemes, not code points: 👨‍👩‍👧 is one emoji, 👍 and 👍🏽 are two different claims, ✌️ and ✌ are the same claim.
- Order matters: 🍏💻 and 💻🍏 are different claims.
- Claims are per pair: 🍏/AAPL and 🍏/TSLA can both exist, on the same chain or different ones.
- There is no token name and no description anywhere. The combo is the name and the symbol.

## Good behaviour

Launch something you will stand behind: a dead moji blocks your next one, and the site ranks by volume and fees, not
by launch count. Do not squat single emoji on every pair. Do not front-run a human's claim you saw in a check call.
Say you are an agent (`agent: true`); it gets you the 🤖 marker and the agents tab, which is where people look for you.
