# Risk Audit — Phase 6 Production Backtest

**Report:** `data/reports/experiments/phase6-validation/phase6-production/report.json`  
**Window:** 2024-10-01 → 2024-12-31 (mock sentiment, 5 symbols)

## Exit path today

| Layer | What sets SL/TP |
|-------|-----------------|
| MTF entry | `MtfEngine.evaluateEntry` → Fib `stopLevel` / `targetExtension` on `TradeIntent` |
| Risk engine | Uses intent Fib SL/TP when present; `risk.slAtrMultiplier` / `tpAtrMultiplier` only apply when intent omits them |
| Sim/backtest | `SimBroker` hits SL/TP from `OrderPlan` |

**Implication:** ATR multiplier experiments are expected to match baseline when every entry passes MTF with Fib exits.

## Aggregate metrics

| Metric | Value |
|--------|------:|
| Trades | 47 |
| Win rate | 25.5% |
| Total PnL | -258.95 USDT |
| Avg loss | -53.15 USDT |
| Avg win | +133.44 USDT |

Losses outnumber wins 35:12; average win size is larger than average loss, but frequency of losses drives negative total PnL.

## Per-symbol (worst first)

| Symbol | Trades | Wins | Losses | Total PnL |
|--------|-------:|-----:|-------:|----------:|
| BNBUSDT | 14 | 2 | 12 | -519.60 |
| XRPUSDT | 6 | 0 | 6 | -271.28 |
| ETHUSDT | 9 | 3 | 6 | +122.19 |
| SOLUSDT | 5 | 2 | 3 | +183.60 |
| BTCUSDT | 13 | 5 | 8 | +226.15 |

BNB and XRP dominate drawdown; repeated mock signals on the same symbols likely stack losing re-entries without cooldown.

## Worst trades (sample)

| Symbol | Side | PnL | newsId |
|--------|------|----:|--------|
| BNBUSDT | BUY | -223.31 | mock-news-262 |
| SOLUSDT | BUY | -105.38 | mock-news-226 |
| SOLUSDT | BUY | -104.68 | mock-news-222 |
| ETHUSDT | BUY | -89.90 | mock-news-278 |
| XRPUSDT | SELL | -71.64 | mock-news-301 |

## Phase 7 hypotheses

1. **Fib exit tuning** — `targetExtension` / `stopLevel` change R:R and hit rate on SL vs TP.
2. **Post-loss cooldown** — skip re-entry on symbol for N hours after a losing close (targets BNB/XRP churn).
3. **ATR multipliers** — control run to confirm no effect when Fib exits are always attached.

## Commands

```bash
npm run analyze-backtest-losses -- --report data/reports/experiments/phase6-validation/phase6-production/report.json
npm run export-backtest-trades -- --report data/reports/experiments/phase6-validation/phase6-production/report.json --sort worst
```
