# Phase 2: Backtest Experiment Framework

## Quick start

```bash
npm run backtest-matrix -- --matrix config/experiments/matrix.yaml
cat data/reports/experiments/COMPARISON.md
```

Dry-run:

```bash
npm run backtest-matrix -- --matrix config/experiments/matrix.yaml --dry-run
```

## Add a new experiment

1. Copy `config/default.yaml` → `config/experiments/my-tweak.yaml`
2. Change **one** hypothesis (e.g. `strategy.fibonacci.entryMin`)
3. Add to `config/experiments/matrix.yaml` under `runs`
4. Run matrix and compare `winRate` / `totalTrades` in `COMPARISON.md`

## Artifacts

| File | Purpose |
|------|---------|
| `BACKTEST-INVENTORY.md` | Before/after capability map |
| `EXPERIMENT-PROTOCOL.md` | Rules for Phases 3–6 |
| `config/experiments/matrix.yaml` | Run manifest |
| `data/reports/experiments/` | Per-run JSON + index |

## Baseline reference

Phase 1: `.planning/phases/01-entry-baseline/baseline-backtest.json` — winRate **0.32**, 25 trades (mock, Oct–Dec 2024).

## Mock sentiment caveat

With `mockSentiment: true`, changing only `sentiment.rules.minStrength` will **not** change results until backtest uses real `news_signals`. Use mock for strategy/MTF/risk; use real signals for sentiment phase.
