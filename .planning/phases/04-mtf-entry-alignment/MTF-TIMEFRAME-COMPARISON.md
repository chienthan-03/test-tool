# MTF Timeframe Comparison

**Matrix:** `config/experiments/mtf-matrix-timeframes.yaml`  
**Window:** 2024-10-01 → 2024-12-31 · **mockSentiment:** true

| runId | context | entry | totalTrades | winRate | totalPnlUsdt | maxDrawdownPct |
|-------|---------|-------|------------:|--------:|-------------:|---------------:|
| mtf-baseline-1d-4h | 1d | 4h | 25 | 32.0% | +288.30 | 2.29% |
| mtf-tf-4h-1h | 4h | 1h | 8 | 25.0% | -83.71 | 1.29% |
| mtf-tf-1d-1h | 1d | 1h | 3 | 100.0% | +80.88 | 0% |

## Analysis

- **1d/4h (default)** — Best trade volume and matches Phase 1 baseline; balanced reference.
- **4h/1h** — Fewer trades, negative PnL; faster TF adds noise vs edge.
- **1d/1h** — Highest winRate but only **3 trades** (over-filtered / tiny sample); not statistically meaningful.

## Recommendation

**Keep default timeframes `1d` / `4h` for Phase 6.** Do not adopt 1h entry without more data and live/sim validation.

Changing TF invalidates direct comparison to Phase 1 unless baseline is re-run on the same pair (done here for 1d/4h).
