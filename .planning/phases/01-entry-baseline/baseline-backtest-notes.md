# Baseline Backtest Notes

**Date:** 2026-05-25

## Date range

- **from:** `2024-10-01`
- **to:** `2024-12-31` (92 days, under 400-day limit in `src/cli/backtest-dates.ts`)
- **Symbols:** BTCUSDT, ETHUSDT (`config/default.yaml`)
- **Klines:** Loaded from `data/klines/{SYMBOL}_1d.json` and `{SYMBOL}_4h.json` (context `1d`, entry `4h`)

## Runs executed

### 1. `mock_sentiment` (baseline for strategy path)

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-12-31 --config config/default.yaml --mock-sentiment
```

- Synthetic long/short signal every 6h per symbol — **skips RSS, rule scorer, LLM**
- Measures MTF + risk + sim fill behavior only
- Results saved in `baseline-backtest.json`

### 2. Real sentiment (not run)

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-12-31 --config config/default.yaml
```

- Requires `news_signals` rows in SQLite for range
- Run `start`/`sim` with RSS first, or defer to Phase 2 after DB has signals

## Interpretation

| Metric | Value | Note |
|--------|-------|------|
| winRate | 0.32 (8/25) | Baseline to beat via filters |
| totalPnlUsdt | +288.30 | Positive despite low win rate — review trade distribution |
| maxDrawdownPct | ~2.29% | On sim equity curve |

**Caveat:** Mock sentiment inflates trade count vs production; Phase 3–4 must rerun with real signals before trusting sentiment changes.

## Reproduce

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-12-31 --mock-sentiment
```
