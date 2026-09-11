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

- `src/lib/emoji.ts` splits input into graphemes, rejects anything that is not exactly 1 to 3 emoji or contains a Latin letter, and normalizes by stripping `U+FE0F/U+FE0E` and skin tone modifiers (`U+1F3FB..U+1F3FF`) so 👍 and 👍🏽 are the same claim.
- `GET /api/claims/check?combo=` runs live as you build the combo (debounced 200ms) and returns `AVAILABLE` or `CLAIMED` with a link to the owner. When a combo is taken it also returns 3 open extensions.
- `POST /api/launch` inserts into `claims` first. The unique index is the permanence guarantee: a conflict returns 409 and nothing is written.

## Launch flow

`src/lib/doppler.ts` builds a Doppler multicurve auction with the selected stock token as `saleConfig.numeraire`:

- 1B supply, 90% sold on the curve
- two curves: `$5k → $2M` (90% of shares, 11 positions) and `$2M → max` tail (10%)
- 0.3% pool fee, `noOp` governance, `noOp` migration, pool locked with beneficiaries
- fees stream 5% to the Doppler protocol owner (required minimum) and 95% to the creator

Numeraire price comes from the stock's Chainlink feed on Robinhood Chain, falling back to Robinhood's public `rhj/prices` API. Curve start/end and tail share live behind the "advanced" disclosure on `/launch`.

Before enabling LAUNCH the app simulates the create and compares `gasEstimate * gasPrice * 1.2` (or the per-chain floor in `src/config/chains.ts`) with the wallet's native balance.

## Stocks

`src/config/stocks.ts` mirrors the market list the LONG app loads on Robinhood Chain: 63 stock/ETF tokens, every address cross-checked against Robinhood's registry (`GET https://api.robinhood.com/rhj/assets`) and verified on-chain via `symbol()/name()/decimals()`. Solana, Ethereum, Arbitrum, Base and Monad are present with `comingSoon: true` and render as disabled "soon" pills. See `src/config/stocks.notes.md` for sources.

## Seed mojis

Six rows are seeded in Supabase so the home and explore pages look populated: 🍏/AAPL, 🐕/NVDA, 🍕/AMZN, 🚀/SPCX, ☕/COST, 🎢/COIN. (DPZ, SPCE, SBUX and SIX are not tokenized on Robinhood Chain, so the nearest real pairs were used.)

The seed rows carry placeholder market cap and fee numbers and no `token_address` until you run the real launches:

```bash
SEED_PRIVATE_KEY=0x... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
```

Doppler is deployed on Robinhood Chain mainnet (4663) but **not** on the Robinhood testnet (46630), so seeds launch on 4663 with real ETH gas. The script only touches rows whose `token_address` is null and writes back the token, pool id and tx hash.

## Market data

`src/lib/market.ts` reads price and market cap from Dexscreener (`/token-pairs/v1/robinhood/<token>`), cumulative fees from the Doppler indexer (`pool.totalFee0/1`), and the creator's unclaimed fees from the SDK (`getMulticurvePool(token).getPendingFees(creator)`). Chart points are derived from indexer swaps. Nothing here quotes or routes a trade.

## Deploy

Vercel or Railway, Node 20+.

1. Set every env var above (service role key and Privy secret as server-only secrets).
2. Build command `npm run build`, start `npm start`.
3. Add the production origin to Privy allowed origins and the X OAuth callback.
4. Point `moji.wtf` at the deployment.

## Pages

`/` home · `/launch` · `/m/[combo]` · `/explore` · `/claimed` · `/about`
