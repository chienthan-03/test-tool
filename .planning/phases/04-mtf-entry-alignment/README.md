# Phase 4 — MTF Entry Alignment Research

## Goal

Find strategy/MTF settings that improve win rate without over-filtering entries.

## Quick start

```bash
# Main hypothesis matrix (mock sentiment)
npm run backtest-matrix -- --matrix config/experiments/mtf-matrix.yaml

# Timeframe pairs
npm run backtest-matrix -- --matrix config/experiments/mtf-matrix-timeframes.yaml

# Export trades for review
npm run export-backtest-trades -- --report data/reports/experiments/mtf-phase4/mtf-baseline/report.json --out trades.csv --sort worst
```

## Winner

`config/experiments/mtf-recommended.yaml` — `zoneTolerancePercent: 0.02`

See `MTF-RECOMMENDATION.md` and `MTF-FINDINGS-FOR-PHASE6.md`.

## Protocol

Use **`mockSentiment: true`** for MTF comparisons (see `../02-backtest-experiments/EXPERIMENT-PROTOCOL.md`). Phase 3 real-signal runs are not comparable to the 25-trade mock baseline.
