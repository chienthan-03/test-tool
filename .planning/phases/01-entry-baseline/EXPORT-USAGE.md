# Trade Export for Manual Review

```bash
npm run export-trades-review -- --limit 50 --out .planning/phases/01-entry-baseline/trades-export.csv
```

Options:

- `--config path/to.yaml` (default: `config/default.yaml`)
- `--limit N` (default: 50)
- `--out path.csv`

## When CSV is empty

Backtest does **not** write to the `trades` table — only `start` / `testnet` / `live` sim modes do.

To populate:

1. Run `npm run dev -- start --mode sim` for a session, or
2. Add trade persistence to backtest in a later phase

Then re-run export.

## Review process

1. Open CSV in spreadsheet editor
2. For each row, use `01-ENTRY-PATH.md` gate checklist
3. Fill `setup_quality`, `would_take_again`, `failure_category`
4. Compare aggregate `would_take_again` rate before/after filter changes
