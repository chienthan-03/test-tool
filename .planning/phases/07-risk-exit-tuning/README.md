# Phase 7: Risk & Exit Tuning

Audit losing trades, experiment Fib exits and post-loss cooldown, validate via matrix.

## Docs

| File | Purpose |
|------|---------|
| `RISK-AUDIT.md` | Phase 6 production loss breakdown |
| `PHASE7-VALIDATION.md` | Matrix results |
| `RISK-RECOMMENDATION.md` | What shipped vs experiment-only |
| `RISK-CONFIG.md` | YAML reference |

## Run validation

```bash
npm run backtest-matrix -- --matrix config/experiments/phase7-validation-matrix.yaml
npm run analyze-backtest-losses -- --report data/reports/experiments/phase7-validation/risk-baseline/report.json
```

## Code

- `src/strategy/symbol-cooldown.ts`
- `scripts/analyze-backtest-losses.ts`
