# Sentiment Preset Recommendation (Phase 3)

## Scoring rubric

| Criterion | Weight | Notes |
|-----------|--------|--------|
| winRate | 40% | All presets tied at 0% (2 trades, both losses) |
| Trade volume | — | All ≥ 50% of baseline (identical 2 trades) |
| False-signal / discard quality | 30% | See `FALSE-SIGNAL-ANALYSIS.md` |
| Operational simplicity | 30% | Rule-only wins when metrics tie |

## Matrix results

See `sentiment-matrix-results.json` and `data/reports/experiments/sentiment-phase3/COMPARISON.md`.

**Finding:** `minStrength` 0.65 and `thresholdLLM` 4 produced the **same** 60 seeded signals and **same** backtest metrics as baseline. Fixture strong-items exceed 0.65; seed path never invokes LLM.

## Winner

**`sentiment-no-llm`** → copied to `config/experiments/sentiment-recommended.yaml`

**Rationale:**

- Tied on automated metrics with baseline and other variants.
- Avoids LLM cost/latency until key-backed live comparison is run.
- Aligns with reproducible fixture/matrix workflow from Phase 2 protocol.

**Not chosen:**

- `sentiment-high-min-strength` — no measurable diff on current fixtures; revisit with live RSS weak signals.
- `sentiment-high-threshold-llm` — irrelevant without LLM in seed/live ingest.

## Phase 6 merge plan (do not apply yet)

Merge into `config/default.yaml`:

```yaml
sentiment:
  llm:
    enabled: false
```

Keep `minStrength: 0.5` and `thresholdLLM: 3` until live-data experiment shows benefit.

Optional code follow-ups: lower false negatives on ETF-only headlines (`FALSE-SIGNAL-ANALYSIS.md`).
