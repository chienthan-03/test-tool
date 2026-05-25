# Phase 6 Validation

**Matrix:** `config/experiments/phase6-validation-matrix.yaml`  
**Window:** 2024-10-01 → 2024-12-31  
**Mock sentiment:** true  
**Executed:** 2026-05-25

## Configs compared

| runId | LLM | Fib tolerance | Symbols |
|-------|-----|---------------|---------|
| `pre-research` | enabled | 0.05 | 5 |
| `phase6-production` | disabled | 0.02 | 5 |

## Results

| runId | Trades | Win rate | PnL (USDT) | Max DD |
|-------|-------:|---------:|-----------:|-------:|
| pre-research | 50 | 24.0% | -274.63 | 6.90% |
| **phase6-production** | **47** | **25.5%** | **-258.95** | **5.73%** |

## Success criteria (from plan)

- `phase6-production` winRate ≥ pre-research → **25.5% ≥ 24.0%** ✓
- OR fewer trades with higher winRate → **47 vs 50 trades, higher win%** ✓

## Comparison to Phase 5

Phase 5 `symbols-expanded` used `mtf-recommended` (fib 0.02) on 5 symbols: **47 trades, 25.5%** — matches `phase6-production` exactly (same fib; production adds LLM-off which does not affect mock runs).

| Baseline | Trades | Win rate | Notes |
|----------|-------:|---------:|-------|
| Phase 1 (2 sym, default fib) | 25 | 32% | mock |
| Phase 4 mtf-tighter-fib (2 sym) | 22 | 36.4% | mock |
| Phase 5 symbols-expanded | 47 | 25.5% | mock, 5 sym |
| Phase 6 pre-research | 50 | 24.0% | looser fib |
| Phase 6 production | 47 | 25.5% | merged preset |

## Interpretation

- Tighter fib (`0.02`) filters ~3 marginal entries vs looser `0.05` on the 5-symbol mock run.
- Win rate and drawdown improve slightly; PnL less negative (still negative in this window — alt symbols dominate losses).
- **Mock sentiment:** LLM flag difference not exercised; confirm with fixture-seeded real signals when needed.

## Artifacts

| Path | Purpose |
|------|---------|
| `data/reports/experiments/phase6-validation/COMPARISON.md` | Matrix output |
| `phase6-validation-results.json` | Index copy for planning |
| `pre-research/report.json`, `phase6-production/report.json` | Full reports |

## Commands

```bash
npm run backtest-matrix -- --matrix config/experiments/phase6-validation-matrix.yaml
npm run export-backtest-trades -- --report data/reports/experiments/phase6-validation/phase6-production/report.json
```
