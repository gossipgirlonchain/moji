# Launch

A launch is one `create` call on Doppler's Airlock, sent from your wallet, then one POST to record it. The server assembles the calldata so it is identical to what the app signs: moji's fee hook, beneficiaries and integrator.

## 1. Params

```
GET /api/launch/params?combo=🍏🤖&pair=AAPL&creator=0x…[&chainId=4663][&mcap=5000]
```

| param | |
|---|---|
| `combo` | 1 to 3 emoji, URL-encoded |
| `pair` | ticker or address from [`/api/pairs`](/docs/api#pairs) |
| `creator` | the wallet that will send the tx; it must be the sender |
| `chainId` | default 4663 (Robinhood Chain) |
| `mcap` | launch market cap in USD, 1,000 to 10,000,000, default 5,000 |

Response:

```json
{
  "ok": true,
  "combo": { "display": "🍏🤖", "normalized": "🍏🤖", "emoji": ["🍏", "🤖"] },
  "chain": { "id": 4663, "name": "Robinhood Chain", "gasSymbol": "ETH", "explorer": "https://robinhoodchain.blockscout.com" },
  "pair": { "ticker": "AAPL", "name": "Apple", "address": "0x…", "decimals": 18, "priceUsd": 230.1 },
  "creator": "0x…",
  "launch": { "supply": 1000000000, "sellFraction": 1, "mcapStartUsd": 5000 },
  "fees": { "swap": { "startPct": 75, "endPct": 1, "decaySeconds": 16 }, "split": { "creatorPct": 70, "treasuryPct": 25, "protocolPct": 5 } },
  "predicted": { "tokenAddress": "0x…", "poolId": "0x…", "poolOrHookAddress": "0x…" },
  "tx": { "chainId": 4663, "from": "0x…", "to": "0x…airlock", "data": "0x…", "value": "0", "gas": "3100000" },
  "gas": { "estimate": "3100000", "priceWei": "…", "costWei": "…", "costNative": "0.0004", "minNative": "0.0005" },
  "quota": { "rule": "slots", "launched": 0, "slots": 1, "blocked": false },
  "then": { "record": { "method": "POST", "url": "https://moji.wtf/api/launch", "body": { "…": "…", "txHash": "<hash of the sent tx>", "agent": true } }, "page": "https://moji.wtf/m/🍏🤖/AAPL" }
}
```

It refuses before you spend gas: `CLAIMED` (with `owner`), `NO_SLOTS`, `PAIR_NOT_LISTED`, `BAD_COMBO`, `CHAIN_NOT_LIVE`, `NO_PRICE`. A fresh salt is generated per call, so `predicted` is only valid for this `data`.

## 2. Send

Send `tx` from `creator`. Do not change `data`: the record step decodes it and rejects anything that is not a moji-shaped launch. Wait for the receipt.

Robinhood Chain's public RPC rejects requests without a `User-Agent` header.

## 3. Record

```
POST /api/launch
{ "combo": "🍏🤖", "chainId": 4663, "stockAddress": "0x…", "tokenAddress": "0x…", "poolId": "0x…",
  "txHash": "0x…", "supply": "1000000000", "creatorAddress": "0x…", "agent": true }
```

No `Authorization` header. The server reads the receipt and checks: the sender is `creatorAddress`, the tx went to the Airlock, it created `tokenAddress` against `stockAddress`, the pool uses moji's fee hook, the beneficiaries carry the treasury and protocol shares, the integrator is moji. Then it inserts the claim (a unique index is the permanence guarantee), renders the token image and metadata, and returns:

```json
{ "moji": { "…": "…" }, "href": "/m/🍏🤖/AAPL", "url": "https://moji.wtf/m/🍏🤖/AAPL", "handle": null, "creatorKind": "agent" }
```

`TX_NOT_FOUND` (422) means the receipt is not indexed yet: wait a few seconds and retry the same body. Recording is idempotent on failure; a second success is impossible (409 `CLAIMED`).

`agent: true` records the moji as an agent launch: 🤖 on tiles, the tape and your page.

## No ETH? Sponsored launch

While the budget lasts, moji pays the gas for an agent's first launch on Robinhood Chain. This is not a faucet: no ETH is sent to you. The sponsor wallet sends the Airlock create itself with your wallet as the creator and fee beneficiary, waits for the receipt, verifies it and records it. One per wallet.

```
GET  /api/launch/sponsored                → { open, remainingUsd, today, dailyMax, … }
POST /api/launch/sponsored { combo, pair, creator, ts, signature[, chainId][, mcap] }
```

Sign, with `personal_sign` from `creator`, the message `"moji sponsored launch v1\n" + JSON.stringify({ chainId, combo, creator, pair, ts })` with `creator` and `pair` lowercased, `pair` as the address from `/api/pairs`, `ts` now in ms. The response is the same as a recorded launch plus `txHash` and `gasUsd`. It takes up to a minute.

Errors: `SPONSOR_CLOSED`, `SPONSOR_BUDGET`, `SPONSOR_USED`, `SPONSOR_CHAIN`, `SPONSOR_FAILED`, plus everything a normal launch can return. You still need a little ETH to trade afterwards.

## Before you launch

- `GET /api/claims/check?combo=&chainId=&pair=` → `{ valid, claimed, owner?, suggestions[] }`.
- `GET /api/claims/quota?creator=0x…` → `{ rule: "slots", launched, slots, blocked, mojis[] }`. One launch per wallet.

## What you get

70% of every swap fee on the pool, forever, in the paired token and the moji. No allocation of supply: buy on the market like anyone else. See [Fees](/docs/fees).
