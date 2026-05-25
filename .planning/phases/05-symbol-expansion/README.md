# Phase 5 — Symbol Expansion

## Goal

Trade SOL, BNB, and XRP on Binance USDⓈ-M Futures alongside BTC/ETH.

## Commands

```bash
npm run prefetch-klines -- --from 2024-10-01 --to 2024-12-31
npm test -- tests/unit/symbol-mapper.test.ts tests/integration/market-symbols-smoke.test.ts
npm run backtest-matrix -- --matrix config/experiments/symbols-matrix.yaml
```

## Outcome

- `config/default.yaml` — 5 symbols
- Backtest comparison: `SYMBOL-BACKTEST-COMPARISON.md`
- Code: `exchange-info.ts` default filters for new symbols

## Next

Phase 6 — merge `sentiment-recommended` + `mtf-recommended` on expanded universe.
