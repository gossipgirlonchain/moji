# Trade

Buy or sell any moji through its own pool. One call returns the calldata; your wallet signs. Nothing to record: the swap is on-chain and the feed reads it from there.

```
GET /api/trade?buy=🍏🤖&pair=AAPL&amount=2&from=0x…[&chainId=4663][&via=stock|eth][&slippageBps=100]
GET /api/trade?sell=🍏🤖&pair=AAPL&amount=1000&from=0x…[…]
```

| param | |
|---|---|
| `buy` or `sell` | the combo |
| `pair` | ticker or address |
| `amount` | whole units of what you spend: the stock (or ETH with `via=eth`) on a buy, the moji on a sell |
| `from` | the wallet that will send the swap |
| `via` | `stock` (default) trades directly against the paired stock; `eth` pays or receives native ETH through a v3 leg |
| `slippageBps` | default 100 (1%) |

Response:

```json
{
  "ok": true, "side": "buy", "via": "stock",
  "moji": { "display": "🍏🤖", "ticker": "AAPL", "chainId": 4663, "tokenAddress": "0x…", "pairAddress": "0x…", "poolId": "0x…", "page": "…" },
  "in":  { "token": "0x…", "symbol": "AAPL", "decimals": 18, "amount": "2", "amountWei": "2000000000000000000" },
  "out": { "token": "0x…", "symbol": "🍏🤖", "decimals": 18, "quote": "48123.4", "quoteWei": "…", "minWei": "…", "slippageBps": 100 },
  "route": null,
  "fee": { "appBps": 50, "treasury": "0x…" },
  "balance": { "wei": "…", "enough": true },
  "approvals": [
    { "to": "0x…token", "data": "0x…", "why": "erc20-to-permit2" },
    { "to": "0x…permit2", "data": "0x…", "why": "permit2-to-router" }
  ],
  "tx": { "chainId": 4663, "from": "0x…", "to": "0x…router", "data": "0x…", "value": "0", "deadlineSeconds": 600 }
}
```

## Sending it

1. If `approvals` is not empty, send each one in order from `from` and wait for its receipt. They are one-time per token: an ERC-20 approve to Permit2, then a Permit2 allowance for the Universal Router. Buys paid in ETH need none.
2. Send `tx`. It carries `minOut` at your slippage and a 10-minute deadline, so fetch it right before sending and never reuse it.

## Fees on a trade

The pool's own fee, 1% (75% in the first 16 seconds after a launch), goes to the creator, the treasury and Doppler. On top, `fee.appBps` (0.5%) of the output goes to the moji treasury, the same as the site's trade card.

## Errors

`NOT_FOUND` when that moji is not launched on that pair, `NO_ROUTE` when `via=eth` has no ETH path to that stock on that chain (use `via=stock`), `QUOTE_FAILED` when the quoter or router call failed (retry, or lower the amount).
