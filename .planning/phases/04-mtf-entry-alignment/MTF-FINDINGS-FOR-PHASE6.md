# MTF Findings for Phase 6

**Do not merge into `config/default.yaml` until Phase 6 implementation.**

## Recommended preset

- **File:** `config/experiments/mtf-recommended.yaml`
- **Change:** `strategy.fibonacci.zoneTolerancePercent: 0.02`

## YAML diff vs default

```yaml
strategy:
  fibonacci:
    zoneTolerancePercent: 0.02   # default 0.05
```

**Keep unchanged:**

- `timeframes.context: 1d`, `timeframes.entry: 4h`
- `elliott.contextRequireImpulse: false`
- `entry.waitForNextCandleClose: true`

## Combine with Phase 3

| Layer | Preset |
|-------|--------|
| Sentiment | `sentiment-recommended.yaml` (`llm.enabled: false`) |
| MTF | `mtf-recommended.yaml` (`zoneTolerancePercent: 0.02`) |

Phase 6 should run one matrix: `mockSentiment: false` + fixture seed **and** `mockSentiment: true` baseline check.

## Tests to add

- `mtf-engine` / Fib: price at edge of zone with tolerance 0.02 vs 0.05
- `export-backtest-trades-review` smoke test with minimal report JSON

## Artifacts

- `MTF-ENTRY-RULES.md`, `MTF-HYPOTHESES.md`, `mtf-matrix-results.json`
- `MTF-TIMEFRAME-COMPARISON.md`, `MTF-RECOMMENDATION.md`
- `data/reports/experiments/mtf-phase4/COMPARISON.md`

## Commands

```bash
npm run backtest-matrix -- --matrix config/experiments/mtf-matrix.yaml
npm run backtest-matrix -- --matrix config/experiments/mtf-matrix-timeframes.yaml
npm run export-backtest-trades -- --report data/reports/experiments/mtf-phase4/mtf-tighter-fib/report.json --out review.csv --sort best
```
