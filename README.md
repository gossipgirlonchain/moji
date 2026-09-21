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
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Needed by `POST /api/launch` to write claims + mojis, and by every `/api/creators` route (the `creators` tables have no public RLS policy, so the anon key cannot read them). Dashboard > Project Settings > API |
| `NEXT_PUBLIC_PRIVY_APP_ID` | client | Privy app id. Login is disabled in the UI until this is set |
| `PRIVY_APP_SECRET` | server only | Used by `/api/launch` to verify the caller's Privy access token and record their DID. If unset, launches are still recorded but without DID verification |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | client + server | Optional RPC override for 4663 (default `https://rpc.mainnet.chain.robinhood.com`) |
| `DOPPLER_INDEXER_URL` | server | Optional. Default `https://prod.indexer.doppler.lol/graphql` (indexes 4663) |
| `NEXT_PUBLIC_MOJI_TREASURY` | client + server | Wallet that receives the 25% treasury share of every pool's fees. Launch fails loudly if unset |
| `NEXT_PUBLIC_MOJI_INTEGRATOR` | client + server | Optional. Integrator address passed to the Airlock on every launch (`.withIntegrator`), which attributes mojis to moji in the Doppler app and collects Airlock integrator fees. Defaults to the treasury |
| `NEXT_PUBLIC_SITE_URL` | client + server | Public origin baked into token metadata URIs and share links. Default `https://moji.wtf` |
| `NEXT_PUBLIC_NETWORK` | client + server | `mainnet` (default) or `testnet`. Claims are scoped per network so testnet never burns a mainnet combo |
| `CRON_SECRET` | server only | Protects `/api/cron/refresh`. Vercel cron (every 2 min, `vercel.json`) refreshes the per-moji snapshot: mcap, price, 24h volume, creator pending fees, current fee. Pages render from the snapshot; the client polls live numbers after paint |
| `ADMIN_PASSWORD` | server only | Gates `/admin`, `/design` and `/creators`: treasury dashboard (every pool, treasury pending fees per token, market caps) with Claim buttons that go live when the treasury wallet is connected, the card studio, and the creator pipeline |
| `SEED_PRIVATE_KEY` | scripts only | Funded key for `npm run seed` |
| `NEXT_PUBLIC_DROPS_FEE_BPS` | client + server | Processing fee on drops, in bps of what goes to holders (default `50` = 0.5%). Sent to `NEXT_PUBLIC_MOJI_TREASURY` as one extra transfer |
| `NEXT_PUBLIC_DROPS_ALLOWLIST` | client + server | Optional. Comma-separated pairs (`combo/TICKER@chainId`) whose drops are open while the feature is in testing, on top of `src/config/drops.ts` (`🍎/AAPL@4663`) |
| `NOTO_EMOJI_BASE_URL` | server only | Optional. Where `/api/card` fetches Noto emoji SVGs that are not bundled. Default: the pinned `googlefonts/noto-emoji` commit on raw.githubusercontent.com |

### Privy dashboard setup

1. Create an app at dashboard.privy.io.
2. Login methods: enable **Twitter** and **Wallets** only. Disable email, SMS, passkeys, and everything else.
3. Embedded wallets: the app passes `embeddedWallets.ethereum.createOnLogin = 'users-without-wallets'` in code.
4. Do **not** enable smart wallets, paymasters, or gas sponsorship. Moji never sponsors gas. Users with an empty embedded wallet see a "Fund your wallet" card and a disabled "Not enough gas" button until they send a little ETH.
5. Add `http://localhost:3000` and your production domain to allowed origins.

## Creator pipeline: `/creators`

Outreach CRM for the creators who applied through the Ratio form, gated by the same `ADMIN_PASSWORD` cookie as
`/admin`. Rows live in moji's own Supabase in `creators` + `creator_events` (`supabase/creators.sql`; RLS on, no
public policy, so only the service role key reads or writes). The 169 Ratio applicants were seeded once from the
Ratio project's `creator_applications` table, deduped by X handle, with a starting priority from their follower
band (50K+ = high, 15K+ = medium, 5K+ = low).

- **Stages**: new → reached out → replied → negotiating → agreed → posted → paid, plus declined and no response.
  Entering a stage for the first time stamps `reached_out_at`, `replied_at`, etc. and writes a `stage` event.
- **Pipeline view** is one column per stage with a "→ next" button per card. **List view** is a sortable table
  with checkboxes and a bulk bar: mark DM'd on X or Telegram, set stage, priority, owner, star.
- **Drawer** (click any creator): stage pills, priority stars, owner, tags, deal size, follow-up date (with 2d /
  1w snooze), notes, everything from their application (rates, audience, best posts, wallets), and the timeline.
  "DM on X" / "DM on TG" open the profile and log the touch; a first DM moves them to reached out, "they replied"
  moves them to replied, "they posted" to posted, "paid" to paid.
- **DM template** (toolbar) is saved in the browser with `{name}`, `{first}`, `{handle}`, `{format}` placeholders.
  "copy DM" on a card or in the drawer fills it for that creator.
- **+ add** puts a creator in by hand. **export csv** downloads the whole pipeline.
- API (all admin cookie): `GET /api/creators`, `POST /api/creators`, `GET|PATCH|DELETE /api/creators/[id]`,
  `POST /api/creators/[id]/events`, `POST /api/creators/bulk`, `GET /api/creators/export`.

## Drops: `/drops/[combo]/[pair]/[chainId]` (testing)

A creator gives a set amount of the paired stock token or of their moji to the holders who stick around, by hand:
"give X to the top N holders who held for D days". No contract, no escrow, no schedule. Every drop is a one-off of
plain ERC-20 transfers from the creator's own wallet, one per holder, confirmed on-chain before the next. Open for
every moji (`src/lib/drops/gate.ts`). Privy embedded wallets send the whole batch without a prompt per transfer;
external wallets confirm each one. The pairs in `src/config/drops.ts` (`🍎/AAPL@4663`, plus `NEXT_PUBLIC_DROPS_ALLOWLIST`)
carry the 🪂 rewards marker before their first drop; every other moji gets it once it drops or turns the badge on.

- **Rules a creator sets** (`drops`): what to give (moji or stock) and how much; top N; **hold days** (a wallet is
  ranked on the smallest balance it held across the whole window, so buying this morning does not count); minimum
  holding **in moji tokens**, not USD; minimum payout in USD (default $2, wallets under it are skipped and their share
  goes to the rest); pro-rata with a per-wallet cap or equal shares; extra excluded addresses. The pool, router,
  Doppler contracts, the creator, the treasury and burn addresses are always excluded. The form previews who gets
  paid and refuses an amount (plus fee) above the wallet balance.
- **Flow.** The creator signs the rules (`personal_sign`), the server verifies the signature against
  `creator_address`, ranks holders *now* and stores one `drop_payouts` row per recipient. The page then sends one
  `transfer` per recipient from the creator's wallet and, after every few, posts the tx hashes to
  `POST /api/mojis/[combo]/drops/[id]/sent`, which reads each receipt and marks the matching payout sent (amounts
  come from the chain, never the client). The **0.5% processing fee** (`NEXT_PUBLIC_DROPS_FEE_BPS`) is one more
  transfer to the treasury at the end. Closing the page mid-way is fine: the drop reopens with "N to go"; "cancel
  rest" (signed) closes it and what was sent stays recorded. Nothing is ever held by moji.
- **Holders.** `/api/cron/drops` (every 10 min) replays every `Transfer` of each moji token into `token_transfers` and
  `holder_balances` (with cached `block_times`): pairs that use drops first, then every other moji by staleness, at most
  45s of work per moji per run with the cursor saved after every chunk, so the index stays warm for all of them and a
  creator never opens the drops page onto a cold backfill. The page itself also scans in 40s slices until complete. `GET /api/mojis/[combo]/holders`
  serves the stats tab (count, top-10 share, share in the pool, buckets in moji units, top 20 with held-since) and
  runs an incremental scan when the cursor is stale. Open the stats tab once before the first drop on a moji.
- **Surfaces.** `/drops/🍎/AAPL/4663`: stats tab (market, fees, holders) and drops tab (form with live preview,
  send progress with per-holder tx links, past drops). Moji page: a "Drops 🪂" card with the last drop and the
  connected wallet's total. `/me`: a drops link per moji. Home and explore: a 🪂 pill on mojis that dropped in the
  last 14 days (`mojis.drops_active`, cleared by the cron).
- **Schema.** `supabase/drops.sql`, apply after `schema.sql`. Already applied to the production project.

## Social cards: `/design` and `/api/card`

Brand imagery for X is rendered by one API route and nothing else, so the studio, the download and the post
queue always produce the same pixels.

- **`GET /api/card`** returns a PNG. Query: `template`, `w`, `h` (`1200x1200` default, or `1600x900`), `seed`
  (scatter layout), `mix` (which emoji fill it, defaults to `seed`), plus the template's fields. Responses are cached immutably per query string.

  | template | fields |
  |---|---|
  | `announcement` | `headline` (max 8 words, wraps to 3 lines then shrinks), `subline?` |
  | `pair` | `combo`, `ticker`, `label?` (pill, e.g. `JUST CLAIMED`) |
  | `leaderboard` | `title`, `row=emoji\|pair\|figure` x3 |
  | `open` | `title`, `item=emoji\|ticker` x6 to 8 |
  | `claimed` | `title`, `tile=emoji\|ticker` x8 to 12, `count` |
  | `bignumber` | `pair`, `figure`, `label?` |
  | `token` | `combo`, `ticker`, `creator?`, `stat=label\|value` x2 to 4 |
  | `airdrop` | `combo`, `ticker`, `label?` (pill), `figure`, `sub?`, `stat=label\|value` x2 to 4 |
  | `airdrops` | `title`, `item=emoji\|ticker\|figure\|holders` x3 to 8, `count` |

  Example: `/api/card?template=pair&w=1600&h=900&seed=3&combo=🍎&ticker=AAPL&label=JUST%20CLAIMED`
- **`/design`** (same `ADMIN_PASSWORD` cookie as `/admin`) is a form that builds that URL: template picker,
  fields, size toggle (1600x900 first, since X shows it uncropped), reshuffle (new positions) and swap emoji (new
  emoji, same positions), a live preview
  on a 300ms debounce, and Download PNG (`moji-{template}-{date}.png`), Copy image URL, Copy to clipboard
  (paste straight into the X composer). "Fill from data" loads the fields from Supabase with the queries in
  `src/lib/social.ts`: the leaderboard by a chosen metric (fees earned, 7 day or 24 hour volume, market cap),
  the latest claim for the pair card, 8 unclaimed pool emoji, the last 7 days of claims, a big number that is
  either the biggest 7 day mover or a protocol total (volume this week or today, combos claimed, creator fees,
  combined market cap, new pairs, paid in airdrops), one pair's stats for the token card (type `🪟 / MSFT`, then
  fill), and for the airdrop card the recent airdrops that paid holders (from the `drops` and `drop_payouts`
  tables: USD paid, amount and token, holders paid, median and biggest payout, the hold rule), shown as chips
  that fill the card in one click, and the airdrops roundup (every airdrop of the last 7 days plus the total).
- **Rendering.** `next/og` (satori + resvg) like the token and OG images, with Fredoka 600 and Nunito 800
  self hosted in `src/assets/fonts`. Colors, radii and the clay shadows come from `src/config/design.ts`,
  a TypeScript mirror of `:root` in `globals.css` (`npm run check:tokens` keeps them in sync). Emoji are
  Noto Color Emoji SVGs pinned to one release, so output is identical on every OS; the scatter pool is
  bundled, anything else is fetched once and cached. Because satori blurs every shadow over the full canvas,
  the clay surfaces and the pool emoji (glyph + shadow) are pre-baked to PNG sprites in `src/assets`
  (`npm run cards:assets`, re-run after changing tokens or the pool). `npm run cards:preview` renders every
  template and edge case to `card-previews/` for a visual check.

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
- Rate limit: one claim per DID per 15 minutes, enforced server-side against `mojis.creator_did`. Returns 429 with the minutes remaining.
- Only chains with `live: true` in `src/config/chains.ts` are claimable. Flip that flag to switch a chain on; nothing else changes. Right now only Robinhood Chain is live.
- The claim insert goes first; the unique index is the permanence guarantee. A conflict returns 409 and nothing else is written.

## Token images and sharing

There is no name and no upload, so every moji gets a rendered image:

- `GET /api/img/[combo]` renders a 512x512 PNG: the emoji centered on a sky-gradient clay circle with the app's `--clay` shadow, transparent outside the circle. Rendered with `next/og` (satori) and Noto Color Emoji, so it is identical on every OS.
- On launch the PNG is stored in the public Supabase Storage bucket `moji-images` at `<network>/<hex of normalized combo>.png` and its URL goes on the row (`image_url`).
- The on-chain `tokenURI` is `${NEXT_PUBLIC_SITE_URL}/api/meta/[combo]`, which returns `{ name, symbol, description, image, external_url }`. `image` is the Storage URL once recorded, and the live renderer before that.
- `/m/[combo]/opengraph-image` renders a 1200x630 card with the combo, the pair as "🍏 / AAPL" and the moji wordmark. `generateMetadata` on the moji page sets Open Graph and `twitter:card = summary_large_image`, so links posted to X unfurl with it.
- "Post it" (on the launch success state and permanently on the moji page) opens the X web intent prefilled with `{combo} paired to ${TICKER} on @mojidotwtf 🫡`, the contract address, and the moji link.

## Memes

A moji can carry a picture. The emoji combo is still the name and the claim; the meme is the face.

- **Upload.** Step 4 of `/launch` (optional) picks a picture from the device; it is uploaded right after the launch is recorded. On the moji page the creator (matching Privy DID) sees "add a meme" / "change meme" / "remove" under the hero. `MemePicker` downsizes static images to 1024px in the browser before sending (`src/lib/meme-client.ts`); GIFs go as they are. Cap 4 MB (Vercel's body limit).
- **API.** `POST /api/mojis/[combo]/meme?chain=&pair=` (multipart `file`) and `DELETE` for takedowns. Creator only via the Privy access token, or the `/admin` cookie. `src/lib/memes.ts` normalizes with sharp: static → WebP ≤ 1024px, animated → GIF ≤ 512px, EXIF rotation applied, non-images rejected. Stored in the `moji-images` bucket at `<network>/memes/<moji id>.webp|gif` with a cache-busting `?v=`.
- **Where it shows.** `mojis.meme_url` (`supabase/memes.sql`) feeds `MojiArt` (`src/components/MojiArt.tsx`), the one primitive behind every tile and row (home, explore, leaderboard, top mojis), the moji page hero, the launch success card, and the OG/X share card (`/api/og/[combo]`). `image_url` mirrors the meme so the on-chain tokenURI (`/api/meta/[combo]`) and wallets show it too; removing the meme puts `image_url` back on the rendered emoji circle. Without a meme, every surface shows the emoji on the sky gradient, so nothing looks empty.
- **Takedown.** `/admin` → pools: a "meme ✕" button per moji with a meme.

## Launch flow

`src/lib/doppler.ts` builds a Doppler multicurve auction with the selected stock token as `saleConfig.numeraire`:

- 1B supply, 100% on the curve (with noOp governance the Airlock burns anything not put on the curve; the first launch lost 10% that way)
- three curves (per Doppler's guidance): `$5K → $100M` 1 position 50%, `$5K → $50M` 4 positions 47.5%, `$100M → max` tail 1 position 2.5%
- `noOp` governance, `noOp` migration, pool locked with beneficiaries
- token type `dopplerERC20V1` (Robinhood Chain has no standard TokenFactory in the SDK map)

Numeraire price comes from the stock's Chainlink feed on Robinhood Chain, falling back to Robinhood's public `rhj/prices` API. The launch market cap lives behind the "advanced" disclosure on `/launch`.

Before enabling LAUNCH the app simulates the create and compares `gasEstimate * gasPrice * 1.2` (or the per-chain floor in `src/config/chains.ts`) with the wallet's native balance.

`npx tsx scripts/check-launch.ts` dry-runs the full param assembly and the Airlock create call against 4663 with a throwaway account (eth_call only). Last run: predicted pool fee `8388608` (dynamic flag), gas ~3.1M.

## Fee structure

Constants live in `src/config/fees.ts`. Units are Uniswap V4 pips, `1_000_000 = 100%`, verified against the SDK (`V4_MAX_FEE = 100_000`, `TICK_SPACINGS[10000] = 200`).

**Anti-snipe swap fee: 75% → 1% over the first 16 seconds, then 1%.** `startFee 750_000`, `endFee 10_000`, `durationSeconds 16`. Snipers buying in the first blocks pay most of the trade to the beneficiaries. The SDK's `withDecay()` needs a `v4DecayMulticurveInitializer`, which only exists on Base and Base Sepolia in the SDK address map, so on Robinhood Chain it throws. The schedule is set on the `RehypeDopplerHookInitializer` instead (`withRehypeDopplerHookInitializer({ startFee, endFee, durationSeconds })`), which the SDK turns into a dynamic-fee pool that charges the decaying fee itself. The moji page reads `getFeeSchedule(poolId)` and shows the live rate while the decay is running.

**Beneficiaries** (WAD shares, asserted to sum to exactly `1e18` and protocol share to exactly 5% before anything is signed):

| Beneficiary | Share |
|---|---|
| launch creator's wallet | `parseEther('0.70')` |
| moji treasury (`NEXT_PUBLIC_MOJI_TREASURY`) | `parseEther('0.25')` |
| Doppler protocol owner (`Airlock.owner()`) | `parseEther('0.05')` |

The same list is set as the initializer's lockable `pool.beneficiaries` and as the Rehype hook's `feeBeneficiaries` (`routeToBeneficiaryFees`, 100% of hook fees to the beneficiary bucket, no buybacks, no LP reinvest).

One caveat to know: the Rehype hook itself also skims a fixed 5% of raw hook fees for the Airlock owner before routing the rest, so the protocol's effective take on hook fees is 5% + 5% of the remaining 95%. That skim is in the contract, not configurable. The 5% in the beneficiary list is the minimum the SDK enforces for the initializer-side positions.

**Reading and claiming.** `src/lib/fees.ts` sums the creator's pending fees from both sources, `MulticurvePool.getPendingFees(creator)` and `RehypeDopplerHookInitializer.getPendingFees(poolId, creator)`, and reports them per token (stock amount and moji amount) plus USD. The "Your fees" card's button calls `MulticurvePool.collectFees()` and then the hook (`claimFees(poolId)` for the creator, which collects and releases their share; `collectFees(asset)` for anyone else). It is not gated on being the creator: it reads "Claim" for the creator and "Distribute fees" for everyone else. Claimed tokens are transferred straight to the beneficiary's wallet as ERC-20s (the stock token and the moji token), one transfer from the DopplerHookInitializer and one from the Rehype hook. Nothing is held by moji. A successful claim is recorded via `POST /api/mojis/[combo]/claimed` so the claimed total accumulates. Home page top earners rank by the same live pending + recorded claimed.

## Chains and pairs

Doppler's Airlock takes any ERC-20 as the numeraire, so a moji can pair against a tokenized stock or a token; the launch path (Airlock, DopplerHookInitializer, Rehype fee hook, beneficiaries) is identical either way. The launch page has two tabs, **STOCK** and **TOKEN**.

| chain | id | gas | STOCK tab | TOKEN tab |
|---|---|---|---|---|
| Robinhood Chain (default) | 4663 | ETH | 63 Robinhood Stock Tokens, the LONG list (`stocks.ts`) | ETH (WETH), PONS, AI, PERPSPAD, CASHCAT, BONER, ZZZ, RAM, LLM |
| Base | 8453 | ETH | 8 Coinbase Tokenized Stocks: AAPL, AMZN, GOOGL, META, MSFT, MSTR, NVDA, TSLA (`stocks-base.ts`, 8 decimals) | ETH, AERO, VVV, VIRTUAL, NOCK, BNKR, CLANKER, BRETT, TOSHI, DEGEN |
| Ethereum | 1 | ETH | soon | ETH, UNI, LINK, AAVE, PEPE, COMP, ONDO, LDO, ENA |
| Arbitrum One | 42161 | ETH | soon | ETH, ARB, PENDLE, GMX, RAIN |
| Monad | 143 | MON | soon | soon |
| Solana | | SOL | soon | mints staged in `tokens.ts` (PENGU, PUMP, WIF, BONK, JUP, TRUMP, FARTCOIN, POPCAT, RAY, JTO) for the Solana build |

Every EVM address was verified on-chain (symbol, name, decimals) and checked for real DEX liquidity on 2026-09-12; fake-liquidity pools were excluded. Curated tokens live in `src/config/tokens.ts`; WETH comes from Doppler's address map (`getAddresses(chainId).weth`).

**Prices for the curve and USD display:** WETH from the Doppler indexer (`ethPrices`, Chainlink-sourced); curated tokens from their most liquid real Dexscreener pair; Robinhood stocks from the Chainlink feed, then Robinhood's quote API, then Yahoo; Coinbase stocks by ticker via the same stock path.

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

## iOS app

Two ways onto an iPhone. Both load the same deployment, so a web deploy updates the app and nothing needs resubmitting for a web-only change.

- **Home screen install, today.** Safari → Share → Add to Home Screen. `src/app/manifest.ts` and the `appleWebApp` metadata in `layout.tsx` make it a standalone app with the sky icon (`public/icon-{192,512}.png`). The page runs edge to edge (`viewport-fit=cover`) and `.shell-safe` in `globals.css` pads for the notch and the home indicator.
- **App Store / TestFlight build.** `ios/` is a Capacitor 8 Xcode project (Swift Package Manager, no CocoaPods) whose WKWebView loads `https://moji.wtf`. `capacitor.config.ts` is the source of truth (`wtf.moji.app`, portrait only on iPhone); `native/www/index.html` is the page the shell shows when the site is unreachable. The app icon and splash come from `npm run ios:icons` (`scripts/gen-app-icons.ts`: the wordmark on the sky gradient from `src/config/design.ts`, then `@capacitor/assets` fills `ios/App/App/Assets.xcassets`).

**CI build, no Mac needed.** `.github/workflows/ios.yml` builds the project on a macOS runner on every push that touches `ios/`, `native/`, `capacitor.config.ts` or the package files (and on demand from the Actions tab): a Debug simulator build (`moji-ios-simulator`, drop the unzipped `App.app` onto a booted Simulator) and an unsigned Release device build (`moji-ios-unsigned-ipa`, sign it with your own certificate before installing). Signing and a TestFlight upload step need Apple credentials as repo secrets and are not set up yet.

On a Mac with Xcode 16+:

```bash
npm install
npm run ios:sync    # copies native/www and capacitor.config.ts into ios/
npm run ios:open    # opens ios/App/App.xcodeproj
```

In Xcode pick your team under Signing & Capabilities, run on a device, then Product → Archive → Distribute to TestFlight. Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in the project per release. To point the shell at a preview deployment or a dev server on the same Wi-Fi: `MOJI_NATIVE_URL=http://<mac-ip>:3000 npm run ios:sync` (`Info.plist` allows local networking; add that origin to Privy's allowed origins).

What to know before shipping:

- **Login stays in the web view.** The X login round trip (moji.wtf → auth.privy.io → x.com → back) is on `server.allowNavigation`; every other top-level link to another host, and every `target="_blank"` link (Matcha, Dexscreener, explorers, the X post intent), opens in Safari. The web view origin is `moji.wtf`, so the Privy dashboard needs no new origin. Test X login and an external wallet connect on a real device before submitting: WalletConnect deep links into wallet apps work from the web view, browser extensions do not exist there.
- **Native hooks.** Capacitor injects `window.Capacitor` into the hosted page. `isNativeApp()` in `src/lib/native.ts` and `<html data-native="ios">` (set by `NativeBridge`) are the hooks for anything that should behave differently inside the app.
- **Review.** The app is a shell around the site (App Store guideline 4.2, minimum functionality) that launches tokens (3.1.5, cryptocurrency). Universal links or push notifications for fee claims and drops would strengthen the submission; neither is built yet.

## Pages

`/` home · `/launch` · `/m/[combo]` · `/explore` · `/claimed` · `/me` (your mojis + claim) · `/profile` (wallet, send ETH or claimed tokens to a 0x address or a launcher's @handle) · `/about`
