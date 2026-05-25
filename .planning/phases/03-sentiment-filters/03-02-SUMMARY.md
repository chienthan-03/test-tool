# 03-02 Summary

**Status:** Complete

## Delivered

- `scripts/lib/seed-signals-from-fixtures.ts` + `npm run seed-signals`
- `run-backtest-matrix.ts` — `seedFromFixtures`, per-run `{runId}-signals.db`
- `data/reports/experiments/sentiment-phase3/` — 4 runs, `experiments-index.json`, `COMPARISON.md`
- `sentiment-matrix-results.json`

## Results

All presets: **60 signals seeded**, **2 trades**, **0% win rate**, **-50.40 USDT** (identical). Documented: fixture seed is rule-only; strong items pass all minStrength variants.

## Fixture

Added `tests/fixtures/rss/btc-strong-bull.xml` so seed inserts &gt; 0 signals.
