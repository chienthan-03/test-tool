# Backtest Inventory

**Date:** 2026-05-25

## Current capabilities

| Layer | Location | Behavior |
|-------|----------|----------|
| CLI | `src/cli/commands/backtest.ts` | `--from`, `--to`, `--config`, `--mock-sentiment` |
| Engine | `src/execution/backtest-replayer.ts` | Replays klines, runs StrategyEngine + RiskEngine + SimBroker |
| Config | `src/config/loader.ts` | YAML → Zod `AppConfig` |
| Klines | `data/klines/{SYMBOL}_{interval}.json` | Cache; optional REST download |
| Signals | SQLite `news_signals` OR mock generator | Mock = 6h alternating long/short per symbol |
| Stdout metrics | CLI | `totalTrades`, `wins`, `losses`, `winRate`, `totalPnlUsdt`, `maxDrawdownPct` |
| Full report | `config.backtest.reportDir` | `data/reports/backtest-{timestamp}.json` |

### `BacktestReport` fields (`src/core/types.ts`)

- `from`, `to`, `symbols[]`
- `totalTrades`, `wins`, `losses`, `winRate`, `totalPnlUsdt`, `maxDrawdownPct`
- `trades[]`: `{ symbol, side, entry, exit, pnl, newsId }`

### Phase 1 baseline

Manual capture in `.planning/phases/01-entry-baseline/baseline-backtest.json` (mock sentiment, Oct–Dec 2024).

## Gaps (before Phase 2)

- Unlabeled runs (timestamp-only filenames in `data/reports/`)
- No config hash / experiment id in metadata
- No matrix runner — one CLI invocation per comparison
- No `experiments-index.json` for side-by-side diff
- Sentiment-only config changes invisible under `--mock-sentiment`
- Backtest trades not persisted to SQLite `trades` table

## Phase 2 deliverables

| Deliverable | Path |
|-------------|------|
| Presets | `config/experiments/` |
| Matrix runner | `scripts/run-backtest-matrix.ts`, `npm run backtest-matrix` |
| Labeled output | `data/reports/experiments/{runId}/` |
| Index | `data/reports/experiments/experiments-index.json` |
| Comparison table | `data/reports/experiments/COMPARISON.md` |
| Protocol | `EXPERIMENT-PROTOCOL.md` |
| Tests | `tests/unit/backtest-matrix.test.ts`, `tests/integration/backtest-matrix-smoke.test.ts` |

## Non-goals (Phase 2)

- RSS replay into backtest
- LLM calls during backtest
- Live/testnet parity fixes (Phase 9)
