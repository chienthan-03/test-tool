# Phase 8: Trade Review Workflow

Unified CSV export for manual win-rate review (backtest + SQLite).

## Docs

| File | Purpose |
|------|---------|
| `TRADE-REVIEW-CHECKLIST.md` | Columns + failure categories |
| `REVIEW-PROCESS.md` | Operator steps |
| `PHASE8-PILOT-REVIEW.md` | Phase 6 pre-research vs production pilot |

## Quick start

```bash
npm run export-trade-review -- --source backtest \
  --report data/reports/experiments/phase7-validation/risk-baseline/report.json \
  --out review.csv --limit 15 --sort worst
```

## Code

- `scripts/lib/trade-review-csv.ts` — shared headers
- `scripts/export-trade-review.ts` — unified CLI
- `BacktestReport.gateRejects` when `entryGates.captureRejects: true`
