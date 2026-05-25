# Sentiment Findings for Phase 6

**Do not merge into `config/default.yaml` until Phase 6 implementation plan runs.**

## Recommended preset

- File: `config/experiments/sentiment-recommended.yaml`
- Diff vs default: `sentiment.llm.enabled: false` only

## YAML keys to merge (Phase 6)

```yaml
sentiment:
  llm:
    enabled: false
```

Defer until live LLM A/B completes:

- `sentiment.rules.minStrength` (stay `0.5`)
- `sentiment.rules.thresholdLLM` (stay `3`)

## Tests to add

- `rule-scorer`: ETF-only headline with `impactScore: 2` → document strength 0.4 vs `minStrength` 0.5 discard
- `seed-signals-from-fixtures`: at least one inserted signal for baseline config
- `parseMatrixManifest`: `seedFromFixtures` + `seedRepeat` optional fields

## Artifacts

| Doc | Purpose |
|-----|---------|
| `SENTIMENT-GRID.md` | Experiment design |
| `sentiment-matrix-results.json` | Metrics snapshot |
| `FALSE-SIGNAL-ANALYSIS.md` | Discard reasons |
| `LLM-COMPARISON.md` | LLM deferred |
| `SENTIMENT-RECOMMENDATION.md` | Winner rationale |
| `signals-review-sample.csv` | Manual review |

## Commands

```bash
npm run seed-signals -- --config config/experiments/sentiment-recommended.yaml \
  --db data/reports/experiments/sentiment-phase3/signals.db --from 2024-10-01 --to 2024-12-31
npm run backtest-matrix -- --matrix config/experiments/sentiment-matrix.yaml
```

## Open questions for Phase 4 (MTF)

- Only **2 trades** from 60 signals — MTF/Elliott/Fib gates dominate entry rate; sentiment-only changes may be invisible until MTF research completes.
- Compound filter effects: raising `minStrength` + tighter Fib may over-prune — test jointly in Phase 6.

## Fixture note

`tests/fixtures/rss/btc-strong-bull.xml` added for research (macro+etf impact ≥ 3). Original three fixtures alone yielded **zero** insertable signals at `minStrength: 0.5`.
