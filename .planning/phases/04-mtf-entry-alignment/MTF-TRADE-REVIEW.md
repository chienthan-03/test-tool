# MTF Trade Manual Review

## Samples

| File | Source run | Selection |
|------|------------|-----------|
| `trades-review-worst.csv` | `mtf-baseline` | 5 lowest PnL trades |
| `trades-review-best.csv` | `mtf-tighter-fib` (recommended) | 5 highest PnL trades |

Export command:

```bash
npm run export-backtest-trades -- --report data/reports/experiments/mtf-phase4/mtf-baseline/report.json --out trades.csv --sort worst
```

## Checklist (gates 12–16 in `01-ENTRY-PATH.md`)

For each row, assess:

1. **Pending / wait** — Would `waitForNextCandleClose` have helped worst entries?
2. **Context** — Does 1d trend align with trade direction (mock signals alternate; check symbol)?
3. **Fib zone** — Was price in 0.382–0.618 retrace at entry (tighter 0.02 tolerance for recommended preset)?
4. **ATR** — Was volatility within min/max band?
5. **would_take_again** — Human column in CSV (y/n)

## Placeholder findings

- Worst cluster: several **BTCUSDT SHORT** losses in Oct–Nov 2024 rally — context/trend conflict likely; review against `elliott_context_conflict` logic.
- Best cluster: **tighter-fib** run includes larger winners with fewer marginal entries (22 vs 25 trades).
- Mock `newsId` only — no real headline review until combined Phase 6 run.

Fill `would_take_again` and `notes` in CSV files before Phase 6 merge.
