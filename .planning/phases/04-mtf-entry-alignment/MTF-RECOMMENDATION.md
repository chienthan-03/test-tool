# MTF Preset Recommendation (Phase 4)

## Scoring rubric

| Criterion | Weight | Application |
|-----------|--------|-------------|
| winRate | 35% | vs baseline 0.32 |
| totalTrades ≥ 50% baseline (12+) | implicit | Disqualify if below |
| maxDrawdownPct | 15% | Lower is better |
| totalPnlUsdt | 15% | Secondary |
| Manual review plausibility | 35% | Tighter fib aligns with fewer marginal entries |

## Results summary

| runId | trades | winRate | PnL | Notes |
|-------|-------:|--------:|----:|-------|
| mtf-baseline | 25 | 32.0% | +288 | Reference |
| **mtf-tighter-fib** | **22** | **36.4%** | **+358** | **Winner** |
| mtf-require-impulse | 5 | 20.0% | +100 | Over-filtered |
| mtf-higher-min-atr | 25 | 32.0% | +288 | No change |
| mtf-no-wait-candle | 25 | 32.0% | +288 | No change |
| mtf-stricter-swing | 25 | 32.0% | +288 | No change |

## Winner

**`mtf-tighter-fib`** → `config/experiments/mtf-recommended.yaml`

**Single change vs default:**

```yaml
strategy:
  fibonacci:
    zoneTolerancePercent: 0.02  # was 0.05
```

**Rationale:** Highest winRate (+4.4 pp), +70 USDT PnL, lower drawdown, 88% of baseline trade count (22 ≥ 12).

**Not chosen:**

- `mtf-require-impulse` — only 5 trades.
- Timeframe 1d/1h — 3 trades, 100% win misleading.
- `mtf-no-wait-candle` — identical to baseline on mock path.

## Phase 6 merge (do not apply yet)

Update `config/default.yaml` `strategy.fibonacci.zoneTolerancePercent` only. Keep `timeframes` at 1d/4h. Combine with `sentiment-recommended.yaml` in one validation matrix.
