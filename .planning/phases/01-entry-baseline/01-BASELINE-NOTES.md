# Phase 1 Baseline Findings

**Date:** 2026-05-25

## Executive summary

Phase 1 mapped the full entry pipeline (11 gates from RSS to order placement), defined manual + automated metrics, ran a **mock-sentiment** backtest on BTC/ETH (Oct–Dec 2024), and added `npm run export-trades-review` for SQLite trades. Baseline **win rate is 32%** (8/25 trades) with positive sim PnL — improvement work should target MTF confirm and sentiment gates once real-signal backtests exist in Phase 2–3.

## Entry path

See `01-ENTRY-PATH.md`. Top dropout gates to investigate first:

1. **MTF entry confirm** (`!entry.confirm`) — Elliott/Fib/ATR in `mtf-engine.ts`
2. **MTF context** (`!context.allow`) — higher timeframe alignment
3. **Rule score / LLM** — not measured in mock backtest; critical for live

## Baseline metrics

From `baseline-backtest.json` (mock_sentiment, 2024-10-01 → 2024-12-31):

| Metric | Value |
|--------|-------|
| totalTrades | 25 |
| winRate | 0.32 |
| totalPnlUsdt | +288.30 |
| maxDrawdownPct | 2.29% |

## Manual review status

- Export: `npm run export-trades-review` — **0 closed trades** in DB today (backtest does not persist trades)
- Recommend: run `start --mode sim` to collect ≥20 trades, or extend backtest persistence in Phase 2
- Template: `review-template.csv` + `01-METRICS-SCHEMA.md`

## Hypotheses for Phase 2–4

1. **Phase 2:** Experiment harness — `npm run backtest-matrix` (see `EXPERIMENT-PROTOCOL.md` in phase 02 dir)
2. **Phase 3:** Tighten `minStrength` / `thresholdLLM` once real `news_signals` backtest runs
3. **Phase 4:** Stricter MTF/Fib confirm — likely highest leverage given mock baseline
4. **Phase 5:** SOL/BNB/XRP — more symbols after filters proven on BTC/ETH
5. **Phase 7:** SL/TP multipliers if review shows `sl_too_tight` / `sl_too_wide`

## Risks / unknowns

- Mock sentiment distorts trade frequency vs RSS-driven live
- Live vs backtest parity (WS, LLM, `waitForNextCandleClose`) — Phase 9
- `allowLive: true` in config — address in Phase 10

## Artifacts

| File | Purpose |
|------|---------|
| `01-ENTRY-PATH.md` | Pipeline + checklist |
| `01-METRICS-SCHEMA.md` | Metric definitions |
| `baseline-backtest.json` | Numeric baseline |
| `baseline-backtest-notes.md` | Reproduce commands |
| `EXPORT-USAGE.md` | CSV export |
| `scripts/export-trades-review.ts` | Export tool |
