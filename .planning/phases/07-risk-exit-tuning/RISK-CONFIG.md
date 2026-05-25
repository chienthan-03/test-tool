# Risk Config Reference

| Concern | Config path | Notes |
|---------|-------------|-------|
| Position size % | `risk.positionPercent` | Override per symbol: `symbolOverrides.<SYMBOL>.risk.positionPercent` |
| Min/max notional | `risk.minNotionalUsdt`, `maxNotionalUsdt` | |
| ATR SL/TP fallback | `risk.slAtrMultiplier`, `tpAtrMultiplier` | Used only when intent has no Fib SL/TP |
| Trailing stop | `risk.trailingStop` | |
| Cooldown after loss | `risk.cooldownAfterLoss.enabled` | Blocks new entries on symbol |
| Cooldown hours | `risk.cooldownAfterLoss.durationHours` | Wall-clock hours from loss close |
| Fib stop (primary) | `strategy.fibonacci.stopLevel` | Drives intent SL when MTF confirms |
| Fib target | `strategy.fibonacci.targetExtension` | Drives intent TP |

See also `.planning/phases/06-entry-quality-gates/GATES-CONFIG.md` for entry-layer knobs.
