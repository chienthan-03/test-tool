# Kline Cache Inventory

**Directory:** `data/klines/` (gitignored — local only)  
**Prefetch:** `npm run prefetch-klines -- --from 2024-10-01 --to 2024-12-31`

## Required for Phase 5 backtest (1d + 4h)

| Symbol | 1d bars | 4h bars | Files |
|--------|--------:|--------:|-------|
| BTCUSDT | ~292 | ~1747 | `BTCUSDT_1d.json`, `BTCUSDT_4h.json` |
| ETHUSDT | ~292 | ~1747 | `ETHUSDT_1d.json`, `ETHUSDT_4h.json` |
| SOLUSDT | ~292 | ~1747 | `SOLUSDT_1d.json`, `SOLUSDT_4h.json` |
| BNBUSDT | ~292 | ~1747 | `BNBUSDT_1d.json`, `BNBUSDT_4h.json` |
| XRPUSDT | ~292 | ~1747 | `XRPUSDT_1d.json`, `XRPUSDT_4h.json` |

Warmup: ~200 bars before `2024-10-01` (see `prefetch-klines.ts` / `backtest-replayer.ts`).

## Optional

1h caches exist from earlier work (`*_1h.json`) for Phase 4 timeframe experiments — not required for Phase 5 baseline.
