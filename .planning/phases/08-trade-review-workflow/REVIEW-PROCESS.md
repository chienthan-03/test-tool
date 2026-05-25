# Trade Review Process

## 1. Backtest path (primary for research)

```bash
npm run backtest-matrix -- --matrix config/experiments/phase6-validation-matrix.yaml
npm run export-trade-review -- --source backtest \
  --report data/reports/experiments/phase6-validation/phase6-production/report.json \
  --out .planning/phases/08-trade-review-workflow/my-review.csv \
  --limit 20 --sort worst
```

Optional gate rejects (requires report generated with `entryGates.captureRejects: true`):

```bash
npm run export-backtest-trades -- --report path/report.json --out review.csv --export-rejects
```

## 2. Sim / testnet / live path (SQLite)

After closed trades exist in `data/trader.db`:

```bash
npm run export-trade-review -- --source sqlite --limit 50 --out trades-review.csv
```

## 3. Manual review

Open CSV in spreadsheet. Fill columns per `TRADE-REVIEW-CHECKLIST.md`.

## 4. Record outcome

Document in phase notes or `PHASE8-PILOT-REVIEW.md` style summary:

- Sample size
- % `would_take_again = y`
- Top `failure_category` counts
- Whether automated `winRate` moved in the expected direction

## Scripts reference

| Script | Purpose |
|--------|---------|
| `npm run export-trade-review` | Unified wrapper (`--source backtest\|sqlite`) |
| `npm run export-backtest-trades` | Backtest `report.json` → CSV |
| `npm run export-trades-review` | SQLite closed trades → CSV |
| `npm run analyze-backtest-losses` | Per-symbol loss summary JSON |
