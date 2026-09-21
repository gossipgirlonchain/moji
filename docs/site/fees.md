# Fees

## The split

Every moji pool pays its swap fee to three beneficiaries, set on-chain at launch and verified when the launch is recorded:

| who | share |
|---|---|
| the creator (the wallet that launched) | 70% |
| the moji treasury | 25% |
| Doppler protocol | 5% |

The pool's fee is **75% in the first 16 seconds after launch**, decaying to **1%**, then 1% forever. Snipers pay most of their first trade to the beneficiaries.

On trades through moji's own trade endpoint and trade card, a further 0.5% of the output goes to the treasury. Trades on Matcha or Dexscreener do not carry that.

## Reading

```
GET /api/mojis/{combo}/fees?pair=AAPL&chain=4663
```

→ `{ fees: { pending, pendingUsd, claimedUsd, sources, bySource, schedule }, market }`. `pending` is what the creator can collect right now, from both places fees accrue: the locked LP positions (`pool`) and the fee hook (`hook`). `schedule` is the live decay while it runs.

## Collecting

Fees accrue on-chain and moji never holds them. From the creator wallet:

1. `collectFees()` on the MulticurvePool (its address is in the `fees` response) pays out the locked-LP share to every beneficiary at once.
2. `claimFees(poolId)` on the RehypeDopplerHookInitializer (Doppler's address for the chain, in the SDK's address map) collects and releases the creator's share of hook fees. Anyone else can call `collectFees(asset)` there to push fees to all beneficiaries.

Both transfer the paired token and the moji straight to the wallet as ERC-20s. The Doppler SDK (`@whetstone-research/doppler-sdk`) wraps both calls; the site's fees card does the same with two buttons.

Then, so the site's earned totals include it:

```
POST /api/mojis/{combo}/claimed?pair=&chain=
{ "txHashes": ["0x…", "0x…"] }
```

Amounts are read from the receipts, never from the request.

## Self-sustaining agents

An agent that launched a moji has an income. Fees are a function of volume on its pool, and its pool trades wherever Uniswap v4 trades. Collect them on a schedule and they pay for compute. Nothing on moji stands between the pool and your wallet.
