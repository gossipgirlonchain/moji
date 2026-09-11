# moji

**pick an emoji. pick a stock. launch.**

moji.wtf is a launcher, not an exchange. Every token is a **moji**: a 1 to 3 emoji combo (🍏, 🍏💻 and 💻🍏 are three different claims) paired against a real tokenized stock, launched on [Doppler](https://docs.doppler.lol). Once a combo is claimed it is gone forever, across every chain. You never trade on moji. Trading happens on Matcha and Dexscreener.

Built by dogfooding the [Doppler SDK](https://github.com/whetstoneresearch/doppler-sdk) by Whetstone Research.

## Stack

- Next.js 15 App Router, TypeScript, Tailwind 4
- Privy (`@privy-io/react-auth` + `@privy-io/wagmi`) for auth. Login methods: X (Twitter) and external wallets only. Embedded wallets for X-only users. **Gas is not sponsored.**
- wagmi 3 + viem 2.56 with a custom `defineChain` for Robinhood Chain (4663)
- `@whetstone-research/doppler-sdk` multicurve launch (`buildMulticurveAuction`)
- emoji-mart picker, lightweight-charts, Supabase (claims registry + moji metadata)
- Doppler skills bundles installed in `.claude/skills/` from [whetstoneresearch/doppler-skills](https://github.com/whetstoneresearch/doppler-skills)

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

`npm run typecheck` runs tsc. `npm run build` runs the production build (webpack, not turbopack: `@privy-io/wagmi` breaks under turbopack).

## Env vars

| Var | Where | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase anon key (read-only thanks to RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Needed by `POST /api/launch` to write claims + mojis. Dashboard > Project Settings > API |
| `NEXT_PUBLIC_PRIVY_APP_ID` | client | Privy app id. Login is disabled in the UI until this is set |
| `PRIVY_APP_SECRET` | server only | Used by `/api/launch` to verify the caller's Privy access token and record their DID. If unset, launches are still recorded but without DID verification |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | client + server | Optional RPC override for 4663 (default `https://rpc.mainnet.chain.robinhood.com`) |
| `DOPPLER_INDEXER_URL` | server | Optional. Default `https://prod.indexer.doppler.lol/graphql` (indexes 4663) |
| `NEXT_PUBLIC_MOJI_TREASURY` | client + server | Wallet that receives the 25% treasury share of every pool's fees. Launch fails loudly if unset |
| `NEXT_PUBLIC_SITE_URL` | client + server | Public origin baked into token metadata URIs and share links. Default `https://moji.wtf` |
| `NEXT_PUBLIC_NETWORK` | client + server | `mainnet` (default) or `testnet`. Claims are scoped per network so testnet never burns a mainnet combo |
| `CRON_SECRET` | server only | Protects `/api/cron/refresh`. Vercel cron (every 2 min, `vercel.json`) refreshes the per-moji snapshot: mcap, price, 24h volume, creator pending fees, current fee. Pages render from the snapshot; the client polls live numbers after paint |
| `ADMIN_PASSWORD` | server only | Gates `/admin`: treasury dashboard (every pool, treasury pending fees per token, market caps) with Claim buttons that go live when the treasury wallet is connected |
| `SEED_PRIVATE_KEY` | scripts only | Funded key for `npm run seed` |

### Privy dashboard setup

1. Create an app at dashboard.privy.io.
2. Login methods: enable **Twitter** and **Wallets** only. Disable email, SMS, passkeys, and everything else.
3. Embedded wallets: the app passes `embeddedWallets.ethereum.createOnLogin = 'users-without-wallets'` in code.
4. Do **not** enable smart wallets, paymasters, or gas sponsorship. Moji never sponsors gas. Users with an empty embedded wallet see a "Fund your wallet" card and a disabled "Not enough gas" button until they send a little ETH.
5. Add `http://localhost:3000` and your production domain to allowed origins.

## Supabase schema

The full SQL is in [`supabase/schema.sql`](supabase/schema.sql). Apply it with the SQL editor or `supabase db push`.

```sql
create table public.claims (
  combo text primary key,       -- normalized combo (variation selectors + skin tones stripped)
  display text not null,        -- combo as typed
  chain_id integer not null,
  created_at timestamptz not null default now()
);
create unique index claims_combo_unique on public.claims (combo);

create table public.mojis (
  id uuid primary key default gen_random_uuid(),
  combo text not null unique references public.claims(combo),
  display text not null,
  chain_id integer not null,
  stock_ticker text not null,
  stock_address text not null,
  token_address text, pool_id text, tx_hash text,
  supply numeric,
  market_cap_usd numeric default 0,
  fees_claimed_usd numeric default 0,
  fees_unclaimed_usd numeric default 0,
  creator_did text, creator_handle text, creator_address text,
  launched_at timestamptz not null default now()
);
-- RLS: public select on both, writes only via the service role (server routes).
```

There is no token name column anywhere. The combo is the name.

## How the claim works

Exact normalization rule, implemented in `src/lib/emoji.ts` and checked by `npx tsx scripts/check-emoji.ts`:

- Segment with `Intl.Segmenter({ granularity: 'grapheme' })` and count graphemes, never string length. A combo is 1 to 3 graphemes.
- A ZWJ sequence such as 👨‍👩‍👧 counts as one emoji.
- Skin tone modifiers are preserved: 👍 and 👍🏽 are two distinct claims.
- Variation selectors (`U+FE0F` / `U+FE0E`) are stripped before comparison: ✌️ and ✌ are the same claim.
- Anything that is not an emoji grapheme is rejected: digits, keycap sequences (1️⃣, #️⃣), Latin characters.
- `claims.combo` stores the normalized string, `display` stores the original. The unique index is `(combo, network)`.

`GET /api/claims/check?combo=` runs live as you build the combo (debounced 200ms) and returns `AVAILABLE` or `CLAIMED` with a link to the owner, plus 3 open extensions when taken.

### Who can claim

- Launching requires a Privy account with a linked X account. Wallet-only users can browse, view any moji and open the trade links; their LAUNCH button reads "Link X to claim" and opens Privy's X link flow.
- `POST /api/launch` verifies the Privy access token, reads the DID's linked accounts from Privy server-side (`@privy-io/node`), and refuses without `twitter_oauth`. The X handle written to the row comes from Privy, not the client.
- Rate limit: one claim per DID per hour, enforced server-side against `mojis.creator_did`. Returns 429 with the minutes remaining.
- Only chains with `live: true` in `src/config/chains.ts` are claimable. Flip that flag to switch a chain on; nothing else changes. Right now only Robinhood Chain is live.
- The claim insert goes first; the unique index is the permanence guarantee. A conflict returns 409 and nothing else is written.

## Token images and sharing

There is no name and no upload, so every moji gets a rendered image:

- `GET /api/img/[combo]` renders a 512x512 PNG: the emoji centered on a sky-gradient clay circle with the app's `--clay` shadow, transparent outside the circle. Rendered with `next/og` (satori) and Noto Color Emoji, so it is identical on every OS.
- On launch the PNG is stored in the public Supabase Storage bucket `moji-images` at `<network>/<hex of normalized combo>.png` and its URL goes on the row (`image_url`).
- The on-chain `tokenURI` is `${NEXT_PUBLIC_SITE_URL}/api/meta/[combo]`, which returns `{ name, symbol, description, image, external_url }`. `image` is the Storage URL once recorded, and the live renderer before that.
- `/m/[combo]/opengraph-image` renders a 1200x630 card with the combo, the pair as "🍏 / AAPL" and the moji wordmark. `generateMetadata` on the moji page sets Open Graph and `twitter:card = summary_large_image`, so links posted to X unfurl with it.
- "Post it" (on the launch success state and permanently on the moji page) opens the X web intent prefilled with `just claimed {combo} paired to ${TICKER} on @mojidotwtf 🫡`, the contract address, and the moji link.

## Launch flow

`src/lib/doppler.ts` builds a Doppler multicurve auction with the selected stock token as `saleConfig.numeraire`:

- 1B supply, 90% sold on the curve
- two curves: `$5k → $2M` (90% of shares, 11 positions) and `$2M → max` tail (10%)
- `noOp` governance, `noOp` migration, pool locked with beneficiaries
- token type `dopplerERC20V1` (Robinhood Chain has no standard TokenFactory in the SDK map)

Numeraire price comes from the stock's Chainlink feed on Robinhood Chain, falling back to Robinhood's public `rhj/prices` API. Curve start/end and tail share live behind the "advanced" disclosure on `/launch`.

Before enabling LAUNCH the app simulates the create and compares `gasEstimate * gasPrice * 1.2` (or the per-chain floor in `src/config/chains.ts`) with the wallet's native balance.

`npx tsx scripts/check-launch.ts` dry-runs the full param assembly and the Airlock create call against 4663 with a throwaway account (eth_call only). Last run: predicted pool fee `8388608` (dynamic flag), gas ~3.1M.

## Fee structure

Constants live in `src/config/fees.ts`. Units are Uniswap V4 pips, `1_000_000 = 100%`, verified against the SDK (`V4_MAX_FEE = 100_000`, `TICK_SPACINGS[10000] = 200`).

**Swap fee decay: 3% → 1% over 3600s.** `startFee 30_000`, `endFee 10_000`. The SDK's `withDecay()` needs a `v4DecayMulticurveInitializer`, which only exists on Base and Base Sepolia in the SDK address map, so on Robinhood Chain it throws. The schedule is set on the `RehypeDopplerHookInitializer` instead (`withRehypeDopplerHookInitializer({ startFee, endFee, durationSeconds })`), which the SDK turns into a dynamic-fee pool that charges the decaying fee itself. The moji page reads `getFeeSchedule(poolId)` and shows `fee 2.4% → 1.0%` while the decay is running.

**Beneficiaries** (WAD shares, asserted to sum to exactly `1e18` and protocol share to exactly 5% before anything is signed):

| Beneficiary | Share |
|---|---|
| launch creator's wallet | `parseEther('0.70')` |
| moji treasury (`NEXT_PUBLIC_MOJI_TREASURY`) | `parseEther('0.25')` |
| Doppler protocol owner (`Airlock.owner()`) | `parseEther('0.05')` |

The same list is set as the initializer's lockable `pool.beneficiaries` and as the Rehype hook's `feeBeneficiaries` (`routeToBeneficiaryFees`, 100% of hook fees to the beneficiary bucket, no buybacks, no LP reinvest).

One caveat to know: the Rehype hook itself also skims a fixed 5% of raw hook fees for the Airlock owner before routing the rest, so the protocol's effective take on hook fees is 5% + 5% of the remaining 95%. That skim is in the contract, not configurable. The 5% in the beneficiary list is the minimum the SDK enforces for the initializer-side positions.

**Reading and claiming.** `src/lib/fees.ts` sums the creator's pending fees from both sources, `MulticurvePool.getPendingFees(creator)` and `RehypeDopplerHookInitializer.getPendingFees(poolId, creator)`, and reports them per token (stock amount and moji amount) plus USD. The "Your fees" card's button calls `MulticurvePool.collectFees()` and then the hook (`claimFees(poolId)` for the creator, which collects and releases their share; `collectFees(asset)` for anyone else). It is not gated on being the creator: it reads "Claim" for the creator and "Distribute fees" for everyone else. Claimed tokens are transferred straight to the beneficiary's wallet as ERC-20s (the stock token and the moji token), one transfer from the DopplerHookInitializer and one from the Rehype hook. Nothing is held by moji. A successful claim is recorded via `POST /api/mojis/[combo]/claimed` so the claimed total accumulates. Home page top earners rank by the same live pending + recorded claimed.

## Chains and stocks

`src/config/chains.ts` is the single source of truth: each chain has a viem definition, gas symbol, gas floor, Dexscreener/Matcha slugs and a `live` flag. A chain is claimable when `live` is true **and** it has stock inventory in `src/config/stocks.ts`. Doppler is deployed (Airlock, DopplerHookInitializer, RehypeDopplerHookInitializer, DopplerERC20V1 factory, noOp governance and migrator) on every EVM chain listed here; `npx tsx scripts/check-launch.ts` with `CHAIN=<id> NUMERAIRE=<token>` dry-runs the create call against any of them.

| chain | id | gas | stock inventory |
|---|---|---|---|
| Robinhood Chain (default) | 4663 | ETH | 63 Robinhood Stock Tokens, the LONG list, all verified on-chain (`src/config/stocks.notes.md`) |
| Base | 8453 | ETH | Backed xStocks where they exist (AAPLx, NVDAx, GLDx…), then Dinari dShares. `stocks-base.ts` |
| Arbitrum One | 42161 | ETH | Dinari dShares first, then Backed xStocks. `stocks-arbitrum.ts` |
| Ethereum | 1 | ETH | Ondo Global Markets first, then Backed xStocks. `stocks-ethereum.ts` |
| Monad | 143 | MON | Anchored Finance aStocks. `stocks-monad.ts` |
| Solana | | SOL | soon: needs the Solana Doppler SDK and Solana wallets, a separate integration |

One issuer per ticker per chain (priority by where liquidity actually is), minted supply only, every address verified on-chain; research notes in `src/config/stocks-multichain.notes.md`. Stock prices for the numeraire come from the token's Chainlink feed where one exists (Robinhood Chain), then Robinhood's public quote API, then Yahoo Finance for any US ticker. RPC reads go through per-chain fallback lists with retries (`src/lib/rpc.ts`).

## Seeding

There are no placeholder rows in production. `npm run seed` (with `SEED_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MOJI_TREASURY`) performs real launches on Robinhood Chain for any row whose `token_address` is null, using the same fee structure as the app. Doppler is not deployed on the Robinhood testnet (46630), so seeds cost real ETH gas.

## Market data

`src/lib/market.ts` reads price and market cap from Dexscreener (`/token-pairs/v1/robinhood/<token>`), cumulative fees from the Doppler indexer (`pool.totalFee0/1`), and the creator's unclaimed fees from the SDK (`getMulticurvePool(token).getPendingFees(creator)`). Chart points are derived from indexer swaps. Nothing here quotes or routes a trade.

## Deploy

Vercel or Railway, Node 20+.

1. Set every env var above (service role key and Privy secret as server-only secrets).
2. Build command `npm run build`, start `npm start`.
3. Add the production origin to Privy allowed origins and the X OAuth callback.
4. Point `moji.wtf` at the deployment.

## Pages

`/` home · `/launch` · `/m/[combo]` · `/explore` · `/claimed` · `/me` (your mojis + claim) · `/profile` (wallet, send ETH or claimed tokens out) · `/about`
