# Risk & Exit Recommendation (Phase 7)

**Date:** 2026-05-25  
**Production:** unchanged vs Phase 6 (`risk-baseline`)

## Shipped in code

| Feature | Config | Default |
|---------|--------|---------|
| Post-loss symbol cooldown | `risk.cooldownAfterLoss.enabled` | `false` |
| Cooldown duration | `risk.cooldownAfterLoss.durationHours` | `12` |
| Loss analysis CLI | `npm run analyze-backtest-losses` | — |

`SymbolCooldownTracker` listens on `execution:positionClosed` and blocks new pending signals / entries until duration elapses.

## Not merged into default (research only)

| Preset | Why skipped |
|--------|-------------|
| `risk-fib-tp-2` | Better PnL, **lower win rate** (21.7% vs 25.5%) |
| `risk-cooldown-12h` / `24h` | Worse PnL on mock matrix |
| `risk-fib-stop-786` | No change vs baseline on Oct–Dec 2024 window |
| `risk-atr-wide` | No effect when Fib SL/TP on intent |

## Operator notes

- Tune exits via **`strategy.fibonacci.stopLevel`** and **`targetExtension`**, not `slAtrMultiplier`, when MTF entries are active.
- Enable cooldown for live/sim if you want to reduce re-entry churn after losses; re-validate on your window.
- Consider per-symbol `symbolOverrides.risk.positionPercent` for BNB/XRP (largest losers in audit).

## Next phase

Phase 8 — trade review workflow (export enrichment, review checklist).
