---
name: liquidity-migration
description: Select and verify liquidity migration targets across Uniswap V2, V3 (only when v4 is unavailable and custom fees are required), and V4 paths.
license: MIT
metadata:
  author: doppler
  version: "1.0"
---

> **Source References**: Use [Doppler deployments](https://github.com/whetstoneresearch/doppler/tree/main/deployments) as the contract source of truth for deployed addresses and revisions.

# Liquidity Migration

## When to use
- You are deciding where launch liquidity should migrate after price discovery
- You need protocol-consistent guidance across V2, V3, and V4 destinations
- You need a strict decision rule for when V3 migration is acceptable
- You are verifying `Airlock.migrate(asset)` behavior and migrator selection

## Prerequisites
- Confirm launch posture (non-migrating vs migrable)
- Confirm asset/numeraire orientation and target pool assumptions
- Identify active `liquidityMigrator` in deployment configuration before execution

## Core workflow
1. Choose migration target class:
   - Uniswap V2 (supported)
   - Uniswap V3 (only if Uni v4 is unavailable and custom fees are required)
   - Uniswap V4 (preferred)
2. Validate deployed migrator contract and permissions from `Airlock` wiring.
3. Simulate migration balances and fee handling (`Airlock` -> initializer exit -> migrator).
4. Execute migration and verify destination pool/locker state.

## Option guidance
| Target | Recommendation | Verification anchor |
|---|---|---|
| Uniswap V2 | Supported compatibility path | [migrator-uniswap-v2](../migrator-uniswap-v2/SKILL.md) |
| Uniswap V3 | Use only when Uni v4 is unavailable and custom fees are required | [migrator-uniswap-v3](../migrator-uniswap-v3/SKILL.md) |
| Uniswap V4 | Preferred default | [migrator-uniswap-v4](../migrator-uniswap-v4/SKILL.md) |

## Quick facts
| Item | Detail |
|---|---|
| Migration entrypoint | `Airlock.migrate(asset)` |
| Migration handoff | `liquidityMigrator.migrate(...)` |
| V4 split module | `UniswapV4MigratorSplit` + `TopUpDistributor` |
| V4 standard module | `UniswapV4MulticurveMigrator` |

## Failure modes
- Selecting V3 when Uni v4 is available
- Selecting V3 without an explicit custom-fee requirement
- Misconfigured `liquidityMigrator` address in deployment wiring
- Wrong token orientation leading to incorrect destination position state
- Assuming split-distribution behavior without split migrator configuration

## References
- [airlock](../airlock/SKILL.md)
- [migrator-uniswap-v2](../migrator-uniswap-v2/SKILL.md)
- [migrator-uniswap-v3](../migrator-uniswap-v3/SKILL.md)
- [migrator-uniswap-v4](../migrator-uniswap-v4/SKILL.md)
- [proceeds-split-migration](../proceeds-split-migration/SKILL.md)
- [pda-multicurve](../pda-multicurve/SKILL.md)
- [verification](../verification/SKILL.md)
- Source: `doppler/src/Airlock.sol`, `doppler/src/migrators/UniswapV4MulticurveMigrator.sol`, `doppler/src/migrators/UniswapV4MigratorSplit.sol`
