# 🍎 → AAPLc holder airdrop: tokenomics and mechanism

Research and design notes for paying the AAPLc fee revenue of the 🍎 / AAPL moji back to 🍎 holders on Robinhood Chain (4663). Written 2026-09-15. Everything marked **(repo)** was verified in this codebase or the installed Doppler SDK (1.0.41); everything marked **(web)** comes from the sources linked at the end. Nothing here is legal advice.

## 0. The short version

- **Where the money is.** Every moji pool charges a 1% swap fee (75% → 1% over the first 16 s). Fees accrue in *both* tokens, AAPLc and 🍎, and are split creator 70% / moji treasury 25% / Doppler 5%. The airdrop only concerns the AAPLc leg. **(repo)**
- **It can be wired on-chain, not by hand.** The initializer-side fee bucket is a `FeesManager`, which has `updateBeneficiary(poolId, newBeneficiary)`. The treasury (or the launcher) can move its share to a distributor contract once, permanently, and fees then flow there without a human touching them. The Rehype hook bucket has no such call; that leg has to be claimed by the beneficiary key and forwarded, or a distributor must be a beneficiary from launch on future pairs. **(repo)**
- **The 🍎 token has vote checkpoints.** DopplerERC20V1 exposes `delegate`, `getPastVotes(holder, block)`, `getPastTotalSupply`. A holder who self-delegates gets an on-chain, provable balance history that a claim contract can verify without trusting anyone's snapshot. **(repo)**
- **AAPLc is a freely transferable ERC-20 with a global blocklist**, no allowlist. Anyone can receive it. But the issuer's terms bar delivery "directly or indirectly" to US persons, and the SEC's March 2026 interpretation says a memecoin becomes an investment contract the moment its team promises ongoing distributions from its own efforts. A pull (claim) model with geo-gating is the least bad shape; a push airdrop to every wallet is the worst. **(web)**
- **Gas is not the constraint, dust is.** A batch transfer costs ~25–27k gas per recipient; on Robinhood Chain at the September median gas price that is about three cents each, so a daily drop to 1,000 holders is a few dollars. What actually forces a threshold is that at a $50/day pot, half of a typical memecoin holder base would receive under one cent. **(web + model)**
- **Recommended shape:** linear pro-rata on a 24 h time-weighted average balance, per-wallet cap of 2–5% of each round, a $10-of-🍎 eligibility floor plus a per-round payout floor of ~20× gas with sub-floor accruals rolled forward, exclusions published, claimed (not pushed), and a ramp from 10% of the treasury's AAPLc leg upward after a month of clean data and a securities opinion.

## 1. Where the AAPLc comes from **(repo)**

| Bucket | Contract on 4663 | Per-beneficiary accounting | Can a beneficiary redirect its share? |
|---|---|---|---|
| Initializer-side locked positions | `DopplerHookInitializer` `0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544` (inherits `FeesManager`) | `getShares(poolId, addr)`, `collectFees` | **Yes**: `updateBeneficiary(poolId, newBeneficiary)` releases pending fees to both parties then moves the caller's shares |
| Rehype hook bucket | `RehypeDopplerHookInitializer` (SDK map: `0xe2AEbc987592593b667ec29178D0A83929Db78b6`; the docs table in `stocks.notes.md` lists `0x5f9e…3215`, so read the live pool's hook from `getState` before wiring anything) | `feeBeneficiaries` fixed at init (`FeeBeneficiariesSet`), `collectFees(asset)` | **No** `updateBeneficiary` in the ABI. Also skims a fixed 5% for the Airlock owner first |

Shares are asserted in `src/config/fees.ts`: creator `0.70e18`, treasury `0.25e18`, protocol `0.05e18`. `src/lib/doppler.ts` sets `numeraireFeesToBeneficiaryWad = 1e18`, so 100% of the hook's AAPLc goes to the beneficiary bucket (no buybacks, no LP reinvest).

**Fee math** (1% terminal fee; roughly half of swap volume is on the AAPLc side):

| Daily volume | Total fees | AAPLc-side fees | Treasury 25% | Creator 70% |
|---|---|---|---|---|
| $10K | $100 | $50 | $12.50 | $35 |
| $50K | $500 | $250 | $62.50 | $175 |
| $250K | $2,500 | $1,250 | $312.50 | $875 |
| $1M | $10,000 | $5,000 | $1,250 | $3,500 |

The screenshot's $27–$74/day landing in one wallet is consistent with a launcher-scale share on a healthy pool, or a large holder's cut of a bigger pot.

**The 🍎 token.** `DopplerERC20V1` (impl `0xeDf3f3981E98077591c1B909BCCff0e572bD50f8`). 1B supply, 100% on the curve; unsold inventory and all pool liquidity sit in the Uniswap V4 `PoolManager` (`0x8366…0951`), which is therefore always the largest "holder" and must be excluded. ABI includes ERC-5805 votes (`delegate`, `delegates`, `getPastVotes`, `getPastTotalSupply`, `checkpointAt`, `clock`) and a launch-time balance limit (`maxBalanceLimit`, `balanceLimitEnd`, `isExcludedFromBalanceLimit`). Whether the token auto-delegates on transfer is not visible from the ABI; verify with `delegates(holder)` on a real holder before relying on checkpoints.

**AAPLc.** `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9`, 18 decimals, issuer Robinhood Assets (Jersey), Chainlink feed `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0`. BeaconProxy; implementation `0xb354…5aE2`. Dividends and splits are applied through an on-chain `uiMultiplier()` (ERC-8056), so airdropped units silently accrue Apple's total return; no dividend handling needed. **(web)**

## 2. What AAPLc lets you do, and what Robinhood lets you do **(web)**

- **Transfer rules.** Standard ERC-20 (`transfer`, `transferFrom`, `balanceOf` behave normally per Robinhood's docs). AccessControl + Pausable + upgradeable. A **per-address blocklist checked on sender, recipient and caller**, registry-level so a block applies across every Stock Token at once. **No allowlist**: nobody needs permission to receive.
- **Consequence for batch sends.** One blocklisted recipient reverts the entire batch. Simulate every batch with `eth_call` and drop revertors, or wrap each transfer in try/catch.
- **Sequencer filtering.** Robinhood Chain runs ArbOS 61 compliance filtering: transactions touching a restricted (sanctions) address are rejected at the sequencer or voided with status 0. Screen recipients before submission.
- **Issuer terms.** Stock Tokens "may not be offered, sold, or delivered, directly or indirectly, in the United States or to, or for the account or benefit of, U.S. persons," with further restrictions in Canada, the UK, Switzerland, the UAE and sanctioned jurisdictions. Self-custody is via Robinhood Non-Custodial Ltd (Cayman) for eligible users in ~120 countries; redemption requires the issuer's KYC. Moving the token to your own wallet "changes where the token sits, not what the token is."
- **Freeze risk.** Because the blocklist is global and the sequencer filters, Robinhood can freeze a distributor or vault address it dislikes. Keep AAPLc in a Safe, not an EOA, and keep the float in the distributor small (claim and forward frequently).
- **Chain infra.** Multicall3 is at the canonical address (verified by this repo; 4663 is not yet in the mds1 deployments list, so check bytecode). **No Disperse, GasliteDrop, Uniswap MerkleDistributor, Sablier or Merkl deployment was found on 4663.** All are MIT/GPL and trivial to redeploy with CREATE2.
- **Holder data.** Blockscout v2 REST `GET /api/v2/tokens/{addr}/holders` (50/page, keyset pagination, API key required, 5 RPS free tier; `eth_getLogs` capped at 1,000 records on their RPC-compat endpoint). Blockscout balances are indexer-derived and can lag; for a payout, rebuild balances from `Transfer` logs (this repo's `fee-scan.ts` already walks 500,000-block chunks on 4663) or read `balanceOf` through Multicall3 at a fixed block.
- **Gas reality.** Floor 0.02 gwei; September median ~0.47 gwei with spikes above 5 gwei since memecoin volume took over the chain (~79% of DEX volume; ~432 stock-paired pools). Median execution cost went from under a cent to about 32 cents per transaction.

## 3. Distribution mechanics

Reference gas (Foundry benchmark, 1,000 recipients) and cost on 4663 at ETH ≈ $2,400:

| Pattern | Gas | Who pays | At 0.02 gwei | At 0.47 gwei | At 5 gwei |
|---|---|---|---|---|---|
| GasliteDrop `airdropERC20` | 25.5k / recipient | sender | $0.001 | $0.03 | $0.31 |
| Disperse `disperseToken` | 26.3k / recipient | sender | $0.001 | $0.03 | $0.32 |
| Merkle claim (Uniswap-style) | 87.5k / claim | holder | $0.004 | $0.10 | $1.05 |
| MultiRewards `getReward` | ~60–80k / claim | holder | $0.003 | $0.08 | $0.90 |
| Cumulative Merkle root update | ~50k / round | operator | $0.002 | $0.06 | $0.60 |

Keep push batches under ~800 recipients per transaction (~20M gas) to stay clear of the block limit.

### A. Push batch transfers (Disperse / GasliteDrop)
Cheapest per head, zero holder action, which is what makes "daily" feel magical (the screenshot is exactly this). Downsides: the operator wallet holds AAPLc between claim and send; you pay to hand out cents; one blocklisted recipient reverts the batch; and it is the pattern with the worst legal shape (you "deliver" a security to wallets whose owners you cannot identify). Off-chain policy does all the fairness work.

### B. Merkle claim, cumulative roots (Morpho URD / Merkl pattern)
One root update per round instead of N transfers. Leaf = `(account, token, cumulativeAmount)`; the contract stores `claimed[account][token]` so each new root supersedes the previous one and nothing is lost if a holder skips a week. Holders pay their own claim gas, so dust never gets claimed and sybil wallets do not get paid for free. Add a timelock on root updates and a sweep/expiry for unclaimed balances. The claim UI is where you put geo-gating and an attestation. Uniswap's `MerkleDistributor` is single-round and unsuitable for recurring use; Sablier's airdrops are audited but BUSL and absent from 4663.

### C. Dividend-per-share inside the token (ERC-1726 / reflections)
`magnifiedDividendPerShare += amount * 2^128 / totalSupply` on each deposit, corrections on every transfer, `withdrawDividend` to pull. Exactly pro-rata, O(1), sub-wei dust only. **Not available here**: DopplerERC20V1 is already deployed and has no transfer hook you can retrofit.

### D. Staking vault with a different reward token (Synthetix `StakingRewards` / Curve `MultiRewards`)
Holders stake 🍎; AAPLc arrives (ideally straight from `updateBeneficiary`) and streams over `rewardsDuration`; `rewardPerTokenStored` does the accounting. Time-weighting is free and exact (only staked balance earns, so snapshot sniping is impossible), thresholds and lockups are one line each, and the vault, not a hot wallet, holds the AAPLc. Costs: holders must stake (removes float from the pool and weakens "just hold"), rewards notified before anyone has staked are stranded, and the vault is a single blocklist point of failure. ERC-4626 is the wrong primitive here (share price is not reward accounting); use MultiRewards-style math.

### Snapshot options for A and B
1. **Blockscout holder list** each round. Fast, trusts the indexer, can lag.
2. **Transfer-log replay** from the launch block, reproducible by anyone from a public RPC; integrate balance × seconds over the window for a true TWAB. This is what `fee-scan.ts` already does for fee transfers.
3. **ERC-5805 `getPastVotes`** on the 🍎 token. Holders self-delegate once ("register for drops"); the claim contract then verifies `getPastVotes(holder, snapshotBlock)` on-chain with no operator trust at all. Registration doubles as opt-in and as sybil friction (each wallet must sign once). Needs the auto-delegation check above.

## 4. Fair distribution design

### Threshold
A threshold exists for three reasons: not sending value below gas, shrinking the recipient set, and blunting dust-sybil farming. Because AAPLc is ~$330/unit and 18-decimal, "dust" is a value question, so set two floors:
- **Eligibility floor**: hold ≥ $10 of 🍎 at the pool's TWAP (revisit as the market cap moves).
- **Payout floor**: a round pays a wallet only if its share ≥ ~20× the transfer or claim gas (≈ $0.05–$0.50 depending on gas). Sub-floor accruals **roll forward**, they are never discarded.

Precedents: BOOMER on Robinhood Chain pays a five-stock basket every 15 minutes with no floor and openly warns "tiny bags will earn dust"; MarsCoin pays SPCXB only above 10,000 tokens; Bags.fm pays the top 100 holders every 24 h and only once ≥ 10 SOL has accrued; ZK used ~$100 minimum qualifying amounts.

### Snapshot: time-weighted, randomised, published after the fact
Point-in-time snapshots at a known block are gamed by buy-before/sell-after in one block. Use a 24 h TWAB (PoolTogether's TWAB controller is the reference: averages are not final until the period ends), sample at randomised blocks or integrate the log stream, and publish the cut-off blocks only after the round closes. Flash loans are moot on a fresh v4 pool with no lending market; same-block round trips are the realistic attack, and a ≥ 24 h window kills them.

### Exclusions (publish the list)
Uniswap V4 `PoolManager` `0x8366…0951`, `UniversalRouter` `0x8876…0904`, Airlock `0xeb7C…0862`, both initializers and the Rehype hook, any locker/migrator, the launcher, the moji treasury, the Doppler protocol owner, `0x…dEaD`, any address with code that is not a known Safe or EIP-7702 wallet, known CEX deposit and bridge addresses, and anything that fails a sanctions screen.

### Weighting
| Scheme | Sybil property | Whale property | Verdict |
|---|---|---|---|
| Linear pro-rata | Neutral (splitting gains nothing) | Whale-dominated | Honest default |
| Square-root / quadratic | **Exploitable without identity**: splitting a bag into k wallets multiplies the payout by √k | Flat | Only with proof-of-personhood (Humanode) |
| Capped linear (cap per wallet at 2–5% of the round) | Gameable only above the cap | Tamed | **Recommended** |

Modelled on a synthetic 1,800-wallet lognormal holder base (49% of wallets under $5 of 🍎 at a $250K market cap):

| Pot / day | Floor | Weighting | Paid | Top-10 share | Median payout | Max payout | Dust rolled |
|---|---|---|---|---|---|---|---|
| $50 | none | linear | 470 of 1,800 | 35% | $0.03 | $6.05 | $2.96 |
| $50 | $25 | capped 2% | 424 | 23% | $0.04 | $1.22 | $0 |
| $500 | none | linear | 1,176 | 35% | $0.07 | $60.52 | $2.39 |
| $500 | $5 | capped 2% | 914 | 22% | $0.13 | $11.96 | $0 |
| $500 | $25 | sqrt | 424 | 12% | $0.86 | $11.48 | $0 |

Push gas for the whole round in every row above is under $3 at the 0.47 gwei median. The model is `scripts/airdrop-sim.py` (`python3 scripts/airdrop-sim.py`); it is illustrative, so rerun it against the real holder list once a Blockscout key or RPC is available.

### Wash trading
70% of every 1% fee returns to the launcher, so a launcher self-trading loses only 0.3% per round trip while inflating "revenue". An outside holder with share p of the pot recoups p × X of the fees they pay, always under 100%, so outsiders cannot profit by fee-farming, but the numbers can still be gamed. Attribute fee sources in the round report and exclude launcher-originated volume from any revenue claim.

### Vesting versus lump
Streaming is unnecessary for small recurring amounts. The useful variant is **accrue now, claim later**: accrue daily, claimable after 7 days, forfeited if the wallet dropped below the floor in between. That is what "hold, then keep holding" tokens like BOOMER implicitly reward and what Long.xyz's NVDA rewards did (paid to long-term holders rather than on a schedule).

### Ramp ("start small")
| Phase | Trigger | Share of the treasury's AAPLc leg | Notes |
|---|---|---|---|
| 0 | now | 0% | Claim fees, hold AAPLc in a Safe, publish the exclusion list and the rules, run the snapshot job daily and publish dry-run rounds |
| 1 | securities opinion in hand | 10% (2.5% of pool fees) | Only when a round exceeds a fixed USD minimum (e.g. $25); claim-only; geo-gated UI |
| 2 | one month of clean data, holder count stable or rising | 25% | Add the 7-day claim delay |
| 3 | on-chain wiring | 50–100% | `updateBeneficiary` the treasury's initializer share to the distributor; new pairs launch with the distributor as a beneficiary |

Precedents for ramping: Optimism split OP into multiple airdrops (Airdrop 1 was 5% of supply); Pump.fun started creator revenue share at 0.05% of volume then moved to market-cap-tiered fees (0.95% under $300K tapering to 0.05% above $20M) and later allowed splitting to 10 wallets; Hyperliquid routes 97–99% of fees to buybacks rather than distributions, which is the main fallback if the legal read below is unfavourable.

## 5. Legal shape (factual, not advice) **(web)**

- **The 🍎 token.** SEC staff's 27 Feb 2025 memecoin statement: memecoins are generally not securities, except products "labeled 'meme coins' in an effort to evade" the securities laws. The 17 March 2026 SEC/CFTC joint interpretation classifies memecoins as "digital collectibles" (non-securities) but says a non-security asset becomes subject to an investment contract when an issuer induces investment "with representations or promises to undertake essential managerial efforts from which a purchaser would reasonably expect to derive profits," including in secondary markets. "Hold 🍎, we collect fees and send you Apple stock daily" is that fact pattern. The interpretation treats retrospective airdrops more kindly than prospective promises.
- **The AAPLc.** It is a tokenized debt security, not a collectible; the 2026 airdrop safe treatment covers "non-security crypto assets" only. The SEC's 1999 "free stock" actions held that giving away securities in exchange for registering, holding or promoting is an "event of sale". Robinhood's terms prohibit delivery to US persons; Reg S Category 3 debt carries a 40-day distribution compliance period. **A pseudonymous push airdrop cannot show recipients are non-US. This is the single largest exposure.** The proposed Regulation Crypto Assets (18 Aug 2026) startup exemption does not cover distributing securities.
- **EU.** Robinhood Europe UAB offers the tokens as MiFID II instruments (outside MiCA). Distributing them to EU retail is distribution of a financial instrument by an unlicensed party; MiCA's "offered for free" white-paper exemption for the 🍎 token itself requires that nothing (fees, benefits, personal data) is received in exchange, and airdrops over €1M per 12 months in the EU need an NCA notification. ESMA has warned tokenized stocks "could mislead investors"; the Bank of Lithuania has already sought clarifications from Robinhood.
- **Issuer.** Vlad Tenev has said Robinhood Chain developers are "exploring a mechanism to airdrop tokenized stocks to memecoin holders," in design, no timeline, with "SEC and securities-law hurdles". Enthusiasm from the issuer is a positive signal, not a licence; the blocklist is global.

## 6. Recommended build

1. **Pull, don't push.** Cumulative-root Merkle distributor (URD pattern) or a MultiRewards vault. Claim UI gated by geography and an attestation; on-chain record of every claim.
2. **Eligibility engine** as a cron in this repo (it already has Vercel cron, `fee-scan.ts` log walking, Multicall3 and the Doppler SDK): daily TWAB from Transfer logs at randomised blocks, exclusions applied, $10 floor, 2–5% cap, sub-floor carry-forward, sanctions screen, published round report with fee-source attribution.
3. **Deploy on 4663**: your own GasliteDrop (for any push use), a URD-style distributor, and verify Multicall3 bytecode.
4. **Wire the treasury share on-chain** with `updateBeneficiary` once the distributor is live; launch future stock pairs with the distributor as a beneficiary so the Rehype leg is covered too.
5. **Ramp** per the table above, starting at 10% of the treasury's AAPLc leg and only after a securities opinion.
6. **Hygiene**: simulate batches for blocklist reverts, Safe-custody the AAPLc, claim and forward often so the distributor float stays small, and remember AAPLc already compounds Apple dividends through `uiMultiplier()`.

## Sources

Robinhood: https://robinhood.com/rhj/stocktokens/ · https://docs.robinhood.com/chain/building-with-stock-tokens/ · https://docs.robinhood.com/chain/stock-tokens/ · https://docs.robinhood.com/chain/oracles-and-price-feeds/ · https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood · https://www.theblock.co/news/business/2026-07-01-robinhood-chain-goes-live-mainnet-alongside-24-7-tokenized-stocks-lighter-perps-planned-crypto-agentic-trading-406918 · https://dev.to/sulimanmukhtar/robinhood-chain-three-things-the-docs-dont-say-4olb · https://beosin.com/resources/robinhood-chain-stock-token-practice-code-analysis-on-token-contract-and-blockchain-protocol · https://paragraph.com/@themechanismnote/the-multiplier-is-the-position-reading-robinhoods-onchain-stock-tokens-from-the-contract-side · https://github.com/whetstoneresearch/doppler-indexer/blob/main/src/config/chains/robinhood.ts · https://l2beat.com/layer2s/projects/robinhood · https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/validation/compliance-filtering · https://thedefiant.io/news/blockchains/robinhood-chain-gas-fees-jump-82-fold-in-11-days-to-top-every-other-chain · https://crypto.news/robinhood-chain-memecoins-tokenized-stocks/ · https://cryptorank.io/news/feed/06f84-robinhood-ceo-stock-token-airdrop-memecoin · https://github.com/blockscout/docs/blob/main/robinhood-api.mdx

Mechanics: https://github.com/0xpolarzero/airdrop-gas-benchmarks · https://github.com/PopPunkLLC/GasliteDrop · https://github.com/Uniswap/merkle-distributor · https://github.com/morpho-org/universal-rewards-distributor · https://docs.morpho.org/build/rewards/concepts/distribution-system · https://github.com/sablier-labs/airdrops · https://github.com/Roger-Wu/erc1726-dividend-paying-token · https://github.com/Synthetixio/synthetix/blob/master/contracts/StakingRewards.sol · https://github.com/curvefi/multi-rewards · https://0xmacro.com/blog/synthetix-staking-rewards-issue-inefficient-reward-distribution/ · https://v4-docs.pooltogether.com/protocol/design/twab-controller/ · https://docs.doppler.lol/reference/contract-addresses

Fairness precedents: https://airdropalert.com/blogs/tokenized-stock-airdrops/ · https://airdropalert.com/blogs/holder-airdrops-are-back/ · https://airdropalert.com/blogs/what-is-long-xyz/ · https://docs.bags.fm/how-to-guides/launch-token-with-shared-fees · https://pith.science/paper/2504.12859 · https://blog.humanode.io/sybil-resistant-retroactive-airdrop/ · https://github.com/ethereum-optimism/community-hub/blob/main/pages/op-token/airdrops/airdrop-1.mdx · https://docs.arbitrum.foundation/airdrop-eligibility-distribution · https://www.coindesk.com/markets/2025/05/13/pumpfun-launches-revenue-sharing-for-coin-creators-in-push-to-incentivize-long-term-activity · https://blockworks.com/news/pumpdotfun-fee-model · https://tokenomics.com/articles/hyperliquid-tokenomics-how-hype-captures-65m-monthly-in-holder-revenue

Legal: https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins · https://www.nortonrosefulbright.com/en-us/knowledge/publications/a88b661b/sec-and-cftc-release-interpretation-on-crypto-asset-regulation · https://www.wilmerhale.com/en/insights/client-alerts/20260324-the-secs-new-framework-for-crypto-assets-under-howey · https://www.dechert.com/knowledge/onpoint/2026/3/sec-s-crypto-framework--the-new-token-taxonomy.html · https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities · https://www.sec.gov/newsroom/press-releases/99-83-sec-brings-first-actions-halt-unregistered-online-offerings-so-called-free-stock · https://www.sec.gov/files/rules/proposed/2026/33-11434.pdf · https://www.cnbc.com/2025/07/07/robinhood-stock-tokens-face-scrutiny-in-the-eu-after-openai-warning.html · https://www.micacryptoalliance.com/news/esma-q-a-on-mica-white-paper-exemptions-and-territorial-scope
