# Drops: let any creator share fees with their holders

Product and build plan. Companion to `aapl-airdrop-tokenomics.md`, which has the mechanism research and the fairness rules this plan assumes. Nothing here is built yet.

## The idea in one line

A creator opens their moji, sees its stats, and says: **"distribute X AAPL to the top X holders over X days."** They fund it once, a round is cut every day, holders claim on the moji page, and the moji page shows it happening. A second, ongoing mode shares a percentage of every fee claim instead of a fixed amount.

The creator's fee share today is 70% of every swap fee, paid in the stock token and the moji token. "Drops" is a slice of that 70%. Moji's 25% treasury share can opt in the same way, so a card can read "creator shares 25% · moji shares 10%".

## Where it lives

Three surfaces, all reusing existing pieces.

### 1. `/me` (exists: `MyMojis.tsx`)
Each moji card already shows unclaimed amounts and a Claim button. Add one line under the amounts:

```
🍎 / AAPL                                  unclaimed
[ 0.41 AAPL ]  [ 12.4K 🍎 ]
drops · sharing 25% with 312 holders · next round ≈ 0.10 AAPL   [ manage ]
[ Claim & drop ]
```

"manage" opens the creator page below. The Claim button becomes "Claim & drop" when a share is set.

### 2. `/m/[combo]/manage` (new, creator only)
Gated exactly like `FeesCard`: connected wallet matches `creator_address`, plus the Privy token on every write. Two tabs.

**Stats tab.** One column of clay cards, in this order:
- Big numbers: market cap, price, 24h volume (all already in the snapshot).
- Fees: earned lifetime (stock + moji + USD), unclaimed now, claimed so far, current fee rate (from `getFeeSchedule`). All already computed by `getMojiFees`.
- Holders (new): count, new in 24h, top-10 share, % of supply still in the pool, median holding in USD. A small distribution bar (buckets: <$1, $1–10, $10–100, $100–1K, >$1K).
- Drops history: rounds paid, total stock dropped, last round (date, amount, recipients), link to each round's tx or claim root.
- The price chart the public page already has.

**Drops tab.** The control surface. Two modes; a campaign is the default because it is the sentence a creator actually says: *"distribute X amount to the top X holders over X days."*

```
New drop

  Give   [ 0.5 ] AAPL      you have 0.41 AAPL unclaimed + 1.2 AAPL in your wallet
  to the top [ 100 ] holders
  over  [ 7 ] days          → 0.0714 AAPL per day, one round a day at 09:00 UTC

  Who counts as a holder
    ranked by 24h average balance at each daily cut (not a single snapshot)
    auto-excludes the pool, you, moji, contracts   + exclude an address …
    split   (•) pro-rata by holding, capped at 5% per wallet   ( ) equal shares

  Preview (today's holders)
    top 100 = wallets holding ≥ $23 of 🍎 · median payout 0.0004 AAPL ($0.13) · largest 0.0036 AAPL ($1.19)
    if you sold today, rank 100 would be 0x8a…c1 with $23.10

  Drops are not offered to US persons. You confirm you have read the terms.  [ ]
  [ Fund and start ]     ← one approve + one deposit into the distributor; the schedule runs from there
```

Under it, the campaign list: each campaign shows amount, top N, days, progress ("day 3 of 7 · 0.21 of 0.5 AAPL paid · 100 wallets/day"), and Pause / Top up / End (unpaid remainder returns to the creator).

**Ongoing mode** (a second card, off by default): "share [25]% of every fee claim with the top [100] holders". Same eligibility rules, no fixed amount or end date; each Claim & drop cuts a round. This is the phase-1 percentage model below, kept for creators who want it to run forever.

Saving never moves money. It records the pledge; money moves only on a claim or a distributor call.

### 3. `/m/[combo]` public page (exists)
A new "Drops" card directly under `FeesCard`, visible to everyone. This is the card that gets screenshotted.

```
Drops
@handle is giving 0.5 AAPL to the top 100 holders over 7 days · day 3 of 7
yesterday · 0.0714 AAPL to 100 holders
your share · 0.0021 AAPL ≈ $0.70            [ Claim ]
next round · today 09:00 UTC · you are rank 41
```

For a wallet that is not eligible: "hold $10 of 🍎 to be in the next round". For a moji with no drops: the card is not rendered, but explore and the leaderboard show a "drops" pill on mojis that share, and the leaderboard gets a "paid to holders" sort.

## How the money moves

A campaign is funded up front: the creator deposits the whole amount into the distributor when they press Fund and start, so the daily rounds never need the creator's key again and the moji page can promise "0.0714 AAPL a day for 7 days" truthfully. The ongoing percentage is a policy, not a contract parameter. FeesManager's `updateBeneficiary` moves *all* of a caller's shares, not a fraction, so a percentage needs either a server-computed round or a splitter contract. Three phases, each one shippable on its own.

### Phase 1 · Claim & drop (no new contracts beyond a batch sender)
1. Creator presses Claim & drop on `/me` or the moji page.
2. Existing claim transactions run (`MulticurvePool.collectFees`, `RehypeDopplerHookInitializer.collectFees`). Fees land in the creator's wallet as today.
3. Server computes the round from the latest holder snapshot: pot = share% × stock received this claim, eligibility and caps per the research doc, returns the recipient list and amounts.
4. Creator sends one batch transfer through a moji-deployed batch contract on 4663 (GasliteDrop clone; nothing like it exists on the chain yet). Two wallet confirmations after the claim: approve, drop. Creator pays gas, a few cents.
5. Server records the round and payouts.

Pros: non-custodial, moji never holds anything, fits "gas is not sponsored". Cons: push delivery (the weakest legal shape in the research), cadence depends on the creator, sub-floor holders get nothing until the pot is big enough.

### Phase 2 · Holders claim (recommended target for launch)
Same as phase 1 up to step 3, but step 4 deposits the pot into a cumulative-root Merkle distributor (one contract per chain, keyed by moji, Morpho URD pattern) and publishes the round's root. Holders press Claim on the moji page and pay their own claim gas. Sub-floor amounts accumulate across rounds automatically because roots are cumulative. This is the version that turns the moji page into a place holders come back to, and it is where the geo gate and the attestation live.

### Phase 3 · Runs without the creator
A per-moji Splitter contract becomes the creator's beneficiary via `updateBeneficiary(poolId, splitter)`. The splitter forwards share% to the distributor and the rest to the creator, share adjustable by the creator, reversible by pointing beneficiary back. Anyone can call `distribute` (the moji page already has a "Distribute fees" button for non-creators), and a cron can cut rounds daily at a fixed time, which is the "9:15 AM every day" experience in the screenshot. New launches get a "share X% with holders" field on `/launch` so the splitter is a beneficiary from block one and the Rehype leg is covered too.

## Data

New tables, all RLS on with public select where noted, writes via service role only (same pattern as `mojis`).

- `moji_drops`: `moji_id`, `share_bps`, `min_hold_usd`, `cap_bps`, `excluded text[]`, `terms_ack boolean`, `signature`, `signed_message`, `updated_at`. Public select (the public card reads it).
- `holder_snapshots`: `id`, `moji_id`, `block`, `taken_at`, `holders`, `eligible`, `top10_bps`, `pool_bps`, `median_usd`, `buckets jsonb`. Public select.
- `holder_balances`: `snapshot_id`, `address`, `balance numeric`, `twab numeric`. Not public; the preview and the round builder read it server-side.
- `drop_campaigns`: `id`, `moji_id`, `token` (stock or moji leg), `amount numeric`, `top_n`, `days`, `split` (`prorata_capped` | `equal`), `cap_bps`, `starts_at`, `ends_at`, `paid numeric`, `status` (`funded` | `running` | `paused` | `done` | `ended`), `fund_tx`, `signature`. Public select.
- `drop_rounds`: `id`, `moji_id`, `campaign_id` (null for ongoing-mode rounds), `round_no`, `snapshot_id`, `pot_stock numeric`, `share_bps`, `recipients`, `tx_hash`, `merkle_root`, `status`, `cut_at`. Public select.
- `drop_payouts`: `round_id`, `address`, `amount numeric`, `claimed_tx`, `claimed_at`. Public select by address (for "your share").

`mojis` gains `drops_share_bps` (denormalised for explore and leaderboard sorts) and `drops_paid_stock`, `drops_paid_usd` totals refreshed by the cron.

## Jobs and routes

- `GET /api/cron/holders` (new, hourly, `CRON_SECRET`): for every moji with a token, replay Transfer logs since the last snapshot (same chunked `eth_getLogs` walk as `fee-scan.ts`), keep running balances, compute a 24h time-weighted average at a randomised block, apply exclusions, write a snapshot. Robinhood Chain allows 500,000-block chunks, so an hourly incremental scan is small.
- `GET /api/mojis/[combo]/holders` (public): latest snapshot summary for the Stats tab and the public card.
- `GET|PUT /api/mojis/[combo]/drops` (creator, Privy token + wallet match): read and save the config. PUT verifies the signature over a canonical message.
- `GET /api/mojis/[combo]/drops/preview?share=2500` (creator): runs the round maths against the latest snapshot and yesterday's fees.
- `POST /api/mojis/[combo]/drops/campaigns` (creator): validate amount, top N, days; build the canonical message; return the approve + deposit calldata. `PATCH …/campaigns/[id]` pauses, tops up or ends one.
- `GET /api/cron/drops` (new, daily at the cut time, `CRON_SECRET`): for every running campaign, take the day's snapshot, rank by 24h average balance, cut a round of `amount / days`, publish the root (phase 2) or queue the batch (phase 1). A campaign that ends with a remainder returns it to the creator.
- `POST /api/mojis/[combo]/drops/round` (creator, ongoing mode): given the claim tx hash, reads the stock amount received, builds the recipient list and amounts (phase 1) or the Merkle tree and root (phase 2), stores the round as `pending`, returns calldata.
- `POST /api/mojis/[combo]/drops/round/[id]/sent` (creator): records the drop tx or root publication, flips status to `paid`.
- `GET /api/mojis/[combo]/drops/me?address=` (public): the connected wallet's claimable amount and proof.

The existing `POST /api/mojis/[combo]/claimed` keeps recording creator claims; the drop share is subtracted from `fees_creator_stock_claimed` so the leaderboard's "earned" stays honest.

## Rules the UI enforces (from the research)

- Share applies to the stock leg only in v1. 🍎-leg drops are a later toggle.
- Eligibility floor defaults to $10 of the moji at the pool price; payout floor is ~20× claim gas; sub-floor accruals roll forward (free in phase 2).
- Linear pro-rata with a per-wallet cap, default 5%. No square-root option: it is beaten by splitting wallets.
- Snapshot is a 24h time-weighted average at a randomised block, published after the round is cut.
- Always excluded: the V4 PoolManager, UniversalRouter, Airlock, both initializers, the Rehype hook, the creator, the treasury, the protocol owner, the burn address, contracts that are not known Safes. Creator can add addresses. The list is public on the round page.
- Every batch or root is simulated before it is sent; a blocklisted AAPLc recipient is dropped from the round, not left to revert the whole thing.
- Copy says "shares fees", never "yield", "dividend" or "APY". The claim page carries the not-for-US-persons gate. A securities opinion gates turning the feature on for everyone rather than a whitelist of creators.

## Build order

1. Holder snapshot cron + `holder_snapshots` + public holders route. Ship the Stats tab with holders data. No money moves. (This alone is a good feature.)
2. `moji_drops` config, the Drops tab with preview, the public Drops card in "pledged, no rounds yet" state.
3. Batch sender contract on 4663, round builder, Claim & drop. Phase 1 live for a whitelist of creators (start with 🍎 and the treasury).
4. Merkle distributor on 4663, holder Claim on the moji page, geo gate. Phase 2.
5. Splitter + `updateBeneficiary` flow, cron-cut rounds, `/launch` option. Phase 3.

Open questions for tomorrow: whether "top N" should have a value floor as well (a top-100 rule on a moji with 40 real holders pays dust wallets); whether the treasury's opt-in share is a global number or per moji; whether drops in the moji leg are wanted at all (they are cheaper legally, since 🍎 is not a security, and could ship first as a lower-risk version of the whole feature); and whether a creator can change the share while a round is pending.
