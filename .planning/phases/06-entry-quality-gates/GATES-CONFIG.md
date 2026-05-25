# Entry Gates — Config Reference

Operator-facing map of knobs that affect whether an entry fires.

## MTF gate layer (`entryGates`)

| Key | Default | Purpose |
|-----|---------|---------|
| `entryGates.enabled` | `true` | When `false`, skip context check (entry-only; tests) |
| `entryGates.logRejects` | `false` | Info log on MTF veto (`context` or `entry` stage) |

The real technical gates are **Elliott context** and **Fib entry** inside `MtfEngine`, invoked through `EntryGate`.

## Sentiment (upstream of strategy)

| Concern | Config path |
|---------|-------------|
| Min signal strength | `sentiment.rules.minStrength` |
| Strong news bypass | `sentiment.rules.strongNewsThreshold` |
| LLM on/off | `sentiment.llm.enabled` |
| LLM trigger threshold | `sentiment.rules.thresholdLLM` |

## MTF / Fib (entry gate internals)

| Concern | Config path |
|---------|-------------|
| Context / entry TFs | `timeframes.context`, `timeframes.entry` |
| Fib retrace band | `strategy.fibonacci.entryMin`, `entryMax` |
| Zone tolerance | `strategy.fibonacci.zoneTolerancePercent` |
| Elliott context rules | `strategy.elliott.*` |
| Swing detection | `strategy.swing.*` |
| Wait for next candle | `strategy.entry.waitForNextCandleClose` |

## Risk (downstream — not entry gates)

| Concern | Config path |
|---------|-------------|
| Position size | `risk.positionPercent` |
| SL/TP ATR multipliers | `risk.slAtrMultiplier`, `tpAtrMultiplier` |

## Risk / cooldown (Phase 7)

| Concern | Config path |
|---------|-------------|
| Cooldown after loss | `risk.cooldownAfterLoss.enabled` |
| Cooldown duration (hours) | `risk.cooldownAfterLoss.durationHours` |
| Max positions | `strategy.onePositionPerSymbol` |

See `.planning/phases/07-risk-exit-tuning/RISK-CONFIG.md` for Fib exit and position sizing.

## Production file

`config/default.yaml` — canonical production config after Phase 6 merges.

Experiment copy: `config/experiments/phase6-production.yaml`.
