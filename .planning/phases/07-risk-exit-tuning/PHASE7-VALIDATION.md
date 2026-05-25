# Phase 7 Validation

**Matrix:** `config/experiments/phase7-validation-matrix.yaml`  
**Window:** 2024-10-01 → 2024-12-31 · **mockSentiment:** true  
**Baseline:** `risk-baseline` (= Phase 6 production, cooldown off)

## Results

| runId | Trades | Win rate | PnL (USDT) | Max DD |
|-------|-------:|---------:|-----------:|-------:|
| **risk-baseline** | **47** | **25.5%** | **-258.95** | **5.73%** |
| risk-fib-stop-786 | 47 | 25.5% | -258.95 | 5.73% |
| risk-atr-wide | 47 | 25.5% | -258.95 | 5.73% |
| risk-fib-tp-2 | 46 | 21.7% | -184.69 | 7.26% |
| risk-cooldown-12h | 46 | 21.7% | -403.12 | 5.84% |
| risk-cooldown-24h | 43 | 20.9% | -363.57 | 5.95% |

## Findings

1. **ATR SL/TP multipliers** (`risk-atr-wide`) — identical to baseline; confirms MTF Fib exits on every intent (see `RISK-AUDIT.md`).
2. **Fib stop 0.786** — no metric change vs 0.886 on this window (same trades/exits).
3. **Fib TP extension 2.0** — fewer trades, lower win rate, **better (less negative) PnL** — trade-off, not a win-rate win.
4. **Post-loss cooldown (12h/24h)** — fewer trades, lower win rate, **worse PnL** on mock backtest; feature shipped **disabled** in `default.yaml` for operator opt-in.

## Production decision

**Keep Phase 6 risk/exit settings** in `config/default.yaml`. Add `risk.cooldownAfterLoss` (default `enabled: false`).

Optional experiment preset: `config/experiments/risk-fib-tp-2.yaml` for PnL-focused runs.

## Artifacts

- `data/reports/experiments/phase7-validation/COMPARISON.md`
- `phase7-validation-results.json`
- `RISK-RECOMMENDATION.md`

## Commands

```bash
npm run backtest-matrix -- --matrix config/experiments/phase7-validation-matrix.yaml
npm run export-backtest-trades -- --report data/reports/experiments/phase7-validation/risk-baseline/report.json --sort worst
```
