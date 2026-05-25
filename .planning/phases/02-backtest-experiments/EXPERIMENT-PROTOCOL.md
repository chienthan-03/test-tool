# Experiment Protocol

**Version:** 2026-05-25  
**Applies to:** Phases 3–6 filter and strategy research

## When to use mock vs real signals

| Mode | Use when |
|------|----------|
| `--mock-sentiment` / `mockSentiment: true` in matrix | Testing **MTF, strategy, risk** gates only. Fast, reproducible. |
| Real signals (`mockSentiment: false`) | Testing **RSS, rule scorer, LLM** changes. Requires `news_signals` in SQLite for the date window (run `start --mode sim` first or ingest signals). |

Never compare a mock run directly to a real-signal run as if they measure the same thing.

## Standard workflow

1. **Add or edit preset** under `config/experiments/{name}.yaml` (full valid `AppConfig`).
2. **Register run** in `config/experiments/matrix.yaml`:
   ```yaml
   runs:
     - id: my-experiment-id
       config: config/experiments/my-experiment.yaml
   ```
3. **Run matrix:**
   ```bash
   npm run backtest-matrix -- --matrix config/experiments/matrix.yaml
   ```
4. **Review results:**
   - `data/reports/experiments/COMPARISON.md` — sortable table
   - `data/reports/experiments/experiments-index.json` — machine-readable
   - `data/reports/experiments/{runId}/report.json` — full trade list
5. **Manual review** (optional): `npm run export-trades-review` after sim/live data exists; use `01-ENTRY-PATH.md` checklist.

## Fixed window (default)

Use **2024-10-01 → 2024-12-31** unless you document a change in the matrix file and `01-BASELINE-NOTES.md`. Changing dates between compared runs invalidates winRate comparison.

## Naming conventions

- `runId`: kebab-case, describes **one variable** changed (`stricter-min-strength`, `mtf-tighter-fib`, not `test2`).
- One primary hypothesis per preset file.

## Acceptance criteria

| Metric | Role |
|--------|------|
| `winRate` | Automated screening (backtest report) |
| `totalTrades` | Ensure filters are not over-pruning |
| `would_take_again` | **Primary human judgment** (CSV review) |
| `totalPnlUsdt` | Secondary — can be positive with low win rate |

Do not ship a filter change based on PnL alone without trade sample review.

## Phase mapping

| Phase | Experiment focus |
|-------|------------------|
| 3 | `sentiment.rules.*`, `thresholdLLM`, LLM on/off |
| 4 | `strategy.*`, `timeframes`, MTF / Fib parameters |
| 5 | `symbols` list (SOL, BNB, XRP) |
| 6 | Combined winning presets from 3–4 |
| 7 | `risk.*` SL/TP multipliers |

## `experiments-index.json` shape

```json
{
  "matrix": "config/experiments/matrix.yaml",
  "from": "2024-10-01",
  "to": "2024-12-31",
  "mockSentiment": true,
  "executedAt": "ISO-8601",
  "runs": [
    {
      "id": "baseline-mock",
      "config": "config/experiments/baseline-mock.yaml",
      "configSha256": "hex",
      "totalTrades": 25,
      "winRate": 0.32,
      "error": null
    }
  ]
}
```

## Anti-patterns

- Changing date range between A/B runs
- Comparing mock-sentiment run against real-signal run
- Tweaking multiple variables in one preset without factorial follow-ups
- Ignoring identical metrics under mock when only sentiment YAML changed (expected — switch to real signals)

## Commands reference

```bash
npm run backtest-matrix -- --matrix config/experiments/matrix.yaml --dry-run
npm run dev -- backtest --from 2024-10-01 --to 2024-12-31 --mock-sentiment
```

See `.planning/phases/02-backtest-experiments/README.md` for quick start.
