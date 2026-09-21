# Drops

A drop is you sending a set amount of your moji (or of the paired token) to the holders who stick around, as plain ERC-20 transfers from your wallet, one per holder. No contract, no escrow, no schedule. moji ranks the holders and records what landed; a 0.5% processing fee on what goes to holders is one extra transfer to the treasury.

Only the wallet that launched the moji can drop.

## 1. Warm the holder index

```
GET /api/mojis/{combo}/holders?pair=&chain=
```

Holder balances are rebuilt from Transfer logs. The first call on a moji may take a while; after that a cron keeps it warm.

## 2. Preview

```
GET /api/mojis/{combo}/drops/preview?pair=&chain=&token=moji|stock&amount=100000&topN=100&holdDays=3&minHold=1000&minPayoutUsd=2&split=prorata|equal&capBps=500
```

→ payouts, how many wallets qualify, the fee. Wallets are ranked on the **smallest balance they held across the whole hold window**, so a wallet that bought this morning does not count for a 3-day rule. The pool, the router, Doppler's contracts, the creator, the treasury and burn addresses are always excluded.

## 3. Sign and create

Build the rules object exactly as the preview validated it:

```json
{ "v": 2, "moji": "🍏🤖", "mojiId": "<uuid>", "chainId": 4663, "token": "moji", "tokenAddress": "0x…", "amount": "100000",
  "topN": 100, "holdDays": 3, "minHold": "1000", "minPayoutUsd": 2, "split": "prorata", "capBps": 500, "excluded": [] }
```

`mojiId` and `tokenAddress` come from `GET /api/mojis`. Sign, with `personal_sign`, `"moji drops v2\n" + JSON.stringify(rules with keys sorted)`, then:

```
POST /api/mojis/{combo}/drops?pair=&chain=
{ "rules": { … }, "signature": "0x…", "signer": "0x…" }
```

→ `{ drop, payouts[] }` with one row per recipient (`address`, `amount_wei`).

## 4. Send

One `transfer(address, amount_wei)` per payout from your wallet, then the fee transfer (`drop.fee_wei` to the treasury address in the response). Post hashes in batches:

```
POST /api/mojis/{combo}/drops/{id}/sent   { "txHashes": ["0x…"] }
```

Amounts are read from the receipts. A half-sent drop can be resumed from `GET /api/mojis/{combo}/drops/{id}`; `POST …/drops/{id}/cancel { signature, signer }` (signs `cancel drop <id>`) closes it and what was sent stays recorded.

## The marker

After at least one drop, the creator can toggle the 🪂 rewards marker: `POST /api/mojis/{combo}/drops/badge { on, signature, signer }`, signing `rewards badge <mojiId> on|off`. A moji that dropped in the last 14 days carries it automatically.
