"""
Airdrop tokenomics simulator for the 🍎 / AAPL moji.

Models a synthetic holder base (power-law, like real memecoin holder sets), then compares
threshold + weighting choices by: recipients paid, share captured by the top 10, dust,
per-drop gas on an Orbit L2, and the smallest / median / largest single payout.
All numbers are illustrative; swap in a real holder CSV when the chain is reachable.
"""
import math, random, statistics

random.seed(7)

SUPPLY = 1_000_000_000            # 1B moji supply
MOJI_MCAP_USD = 250_000           # assumed market cap of 🍎
MOJI_PRICE = MOJI_MCAP_USD / SUPPLY
AAPL_PRICE = 333.0                # from the screenshot: $37.29 / 0.112058 AAPLc

# Non-holder addresses that must be excluded from the eligible set
EXCLUDED = {"v4 PoolManager (pool liquidity)": 0.55, "creator": 0.02, "treasury": 0.0, "dead/burn": 0.0}

def synth_holders(n=1_800, sigma=2.2):
    """Lognormal holder balances (fat right tail, long dust tail) summing to the circulating (non-pool) supply."""
    circulating = SUPPLY * (1 - sum(EXCLUDED.values()))
    raw = [random.lognormvariate(0, sigma) for _ in range(n)]
    s = sum(raw)
    return sorted([r / s * circulating for r in raw], reverse=True)

def weights(balances, scheme, cap_share=None):
    if scheme == "linear":
        w = balances[:]
    elif scheme == "sqrt":
        w = [math.sqrt(b) for b in balances]
    elif scheme == "capped":
        cap = cap_share * sum(balances)
        w = [min(b, cap) for b in balances]
    else:
        raise ValueError(scheme)
    return w

def run(balances, pot_usd, threshold_usd, scheme, cap_share=None, min_payout_usd=0.01):
    eligible = [b for b in balances if b * MOJI_PRICE >= threshold_usd]
    if not eligible:
        return None
    w = weights(eligible, scheme, cap_share)
    tw = sum(w)
    payouts = [pot_usd * x / tw for x in w]
    # payouts under the dust floor stay in the pot (roll to next drop)
    paid = [p for p in payouts if p >= min_payout_usd]
    dust = pot_usd - sum(paid)
    top10 = sum(sorted(paid, reverse=True)[:10]) / pot_usd
    return {
        "eligible": len(eligible),
        "paid": len(paid),
        "top10_share": top10,
        "min": min(paid) if paid else 0,
        "median": statistics.median(paid) if paid else 0,
        "max": max(paid) if paid else 0,
        "dust_rolled": dust,
        "gini": gini(paid),
    }

def gini(xs):
    xs = sorted(xs)
    n = len(xs)
    if n == 0 or sum(xs) == 0:
        return 0
    cum = 0
    for i, x in enumerate(xs, 1):
        cum += i * x
    return (2 * cum) / (n * sum(xs)) - (n + 1) / n

# Gas model for a push airdrop on an Arbitrum Orbit chain (Robinhood Chain gas is ETH).
# ERC-20 transfer to a fresh recipient ~ 50k gas (cold SSTORE) ; batch disperse amortizes ~35k/recipient.
GAS_PER_RECIPIENT = 35_000
L2_GAS_PRICE_GWEI = 0.01           # Orbit chains typically price gas at ~0.01 gwei
ETH_USD = 4_000.0

def gas_usd(recipients):
    return recipients * GAS_PER_RECIPIENT * L2_GAS_PRICE_GWEI * 1e-9 * ETH_USD

if __name__ == "__main__":
    balances = synth_holders()
    print(f"holders: {len(balances)}   moji price ${MOJI_PRICE:.6f}   top holder {balances[0]/SUPPLY:.1%} of supply")
    hv = [b * MOJI_PRICE for b in balances]
    for pct in (10, 25, 50, 75, 90, 95, 99):
        print(f"  {pct}th pct holding ≈ ${sorted(hv)[int(len(hv)*pct/100)-1]:,.2f}")
    for t in (1, 5, 25, 100):
        print(f"  holders under ${t}: {sum(1 for v in hv if v < t)} ({sum(1 for v in hv if v < t)/len(hv):.0%}), holding {sum(v for v in hv if v < t)/sum(hv):.1%} of circulating")

    # Daily pot: what the treasury's 25% share of a 1% swap fee yields at various daily volumes.
    print("\nDaily AAPLc pot from the treasury's 25% fee share (1% terminal fee, half of volume is AAPLc-side):")
    for vol in (10_000, 50_000, 250_000, 1_000_000):
        fee = vol * 0.01
        aapl_side = fee * 0.5
        print(f"  ${vol:>10,} volume/day → total fees ${fee:>8,.0f} → AAPLc fees ${aapl_side:>7,.0f} → treasury 25% = ${aapl_side*0.25:>7,.2f}/day   (creator 70% = ${aapl_side*0.70:,.2f})")

    for pot in (50.0, 500.0):
        print(f"\n=== daily pot ${pot:,.0f} in AAPLc ===")
        print(f"{'threshold':>10} {'scheme':>8} {'elig':>5} {'paid':>5} {'top10':>6} {'gini':>5} {'min$':>7} {'med$':>7} {'max$':>8} {'dust$':>6} {'gas$':>6}")
        for thr in (0, 1, 5, 25, 100):
            for scheme, cap in (("linear", None), ("sqrt", None), ("capped", 0.02)):
                r = run(balances, pot, thr, scheme, cap)
                if not r:
                    continue
                print(f"{thr:>10} {scheme:>8} {r['eligible']:>5} {r['paid']:>5} {r['top10_share']:>6.0%} {r['gini']:>5.2f} {r['min']:>7.3f} {r['median']:>7.3f} {r['max']:>8.2f} {r['dust_rolled']:>6.2f} {gas_usd(r['paid']):>6.2f}")
