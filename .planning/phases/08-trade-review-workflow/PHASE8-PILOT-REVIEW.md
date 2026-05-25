# Phase 8 Pilot — Pre-Research vs Production

**Window:** 2024-10-01 → 2024-12-31 (mock sentiment)  
**Exports:** 15 worst trades each (unified review CSV schema)

## Automated metrics (from Phase 6 matrix)

| Run | Trades | Win rate | PnL (USDT) |
|-----|-------:|---------:|-----------:|
| `pre-research` | 50 | 24.0% | -274.63 |
| `phase6-production` | 47 | **25.5%** | **-258.95** |

Production config: fewer trades, higher win rate, less negative PnL.

## Pilot files

| File | Contents |
|------|----------|
| `pilot-pre-research.csv` | 15 lowest-PnL trades, pre-research config |
| `pilot-production.csv` | 15 lowest-PnL trades, production config |

Columns include empty `exit_reason` / SL/TP for reports generated before Phase 8 enrichment. Re-run backtest to populate `exit_reason` (SL/TP).

## Manual review steps

1. Open both CSVs side by side.
2. For each row, fill `would_take_again`, `failure_category`, `mtf_aligned`.
3. Count **y** rate per file (target sample ≥15 per side).
4. Note whether production **removed** the worst mock-news churn (e.g. BNB `-223` trade) vs pre-research.

## Gate rejects (optional second pass)

Set `entryGates.captureRejects: true`, re-run backtest, export with `--export-rejects` to compare veto volume between configs.

## Hypothesis

Production (LLM off + fib 0.02) should show fewer “obviously bad” re-entries on the same symbol after a loss — validate with `would_take_again` and optional Phase 7 cooldown experiments.
