# Sentiment Experiment Grid (Phase 3)

**Window:** 2024-10-01 → 2024-12-31 (fixed, same as Phases 1–2)  
**Mode:** `mockSentiment: false` — uses `news_signals` from fixture replay  
**Matrix:** `config/experiments/sentiment-matrix.yaml`

## Runs (one variable each)

| runId | Variable | Hypothesis |
|-------|----------|------------|
| sentiment-baseline | default rules (`minStrength` 0.5, `thresholdLLM` 3, LLM on) | Reference for real-signal backtests |
| sentiment-high-min-strength | `minStrength: 0.65` | Drops weak merged signals; fewer entries |
| sentiment-high-threshold-llm | `thresholdLLM: 4` | Fewer items routed to LLM; more rule-only |
| sentiment-no-llm | `llm.enabled: false` | Rule-only path; no API cost |

## Signal seeding (03-02)

1. Replay all `tests/fixtures/rss/*.xml` through `NewsPipeline` (RuleScorer → SignalMerger).
2. Write to per-run DB: `data/reports/experiments/sentiment-phase3/{runId}-signals.db`.
3. Spread `createdAt` evenly across the backtest window; repeat items (`--repeat 30`) for enough signal density from small fixtures.
4. Log discards to `discards.jsonl` for false-signal analysis (03-03).

**Not used:** live RSS poll or `npm run dev -- validate` — fixtures only for reproducibility.

## Comparison notes

- Do not compare these runs to Phase 2 `mockSentiment: true` matrix rows.
- Preset diffs require non-zero seeded signals; see `sentiment-matrix-results.json` after 03-02.
