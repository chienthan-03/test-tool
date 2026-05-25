# MTF Merge (Phase 4 → Production)

**Date:** 2026-05-25  
**Preset:** `config/experiments/mtf-recommended.yaml`

## Change

| Key | Pre-Phase 6 | Phase 6 production |
|-----|---------------|-------------------|
| `strategy.fibonacci.zoneTolerancePercent` | `0.05` | `0.02` |

**Unchanged:** `timeframes.context: 1d`, `timeframes.entry: 4h`, `elliott.contextRequireImpulse: false`, `entry.waitForNextCandleClose: true`.

## Phase 4 reference (2 symbols, mock)

| Preset | Trades | Win rate |
|--------|-------:|---------:|
| Baseline | 25 | 32% |
| `mtf-tighter-fib` | 22 | **36.4%** |

Tighter fib reduces trade count and improved win rate on BTC/ETH.

## Phase 6 validation (5 symbols, mock)

| Config | Trades | Win rate | PnL |
|--------|-------:|---------:|----:|
| `pre-research` (fib 0.05) | 50 | 24.0% | -274.63 |
| `phase6-production` (fib 0.02) | 47 | **25.5%** | -258.95 |

Fewer trades, higher win rate, slightly better PnL vs pre-research on the same 5-symbol universe.

## Tests

- `tests/unit/mtf-engine.test.ts` — fib zone edge at 0.02 vs 0.05
- `tests/unit/entry-gate.test.ts` — context veto, allow path, bypass flag
