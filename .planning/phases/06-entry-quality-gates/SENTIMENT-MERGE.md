# Sentiment Merge (Phase 3 → Production)

**Date:** 2026-05-25  
**Preset:** `config/experiments/sentiment-recommended.yaml`

## Change

| Key | Pre-Phase 6 | Phase 6 production |
|-----|---------------|-------------------|
| `sentiment.llm.enabled` | `true` | `false` |
| `sentiment.rules.minStrength` | `0.5` | `0.5` (unchanged) |
| `sentiment.rules.thresholdLLM` | `3` | `3` (unchanged) |

## Rationale

Phase 3 fixture matrix: all sentiment presets identical (60 signals, 2 trades, 0% win on rule-only seed). Recommendation: disable LLM for cost/latency without metric loss on current fixtures.

## Code path

`NewsPipeline` skips `LlmGateway` when `sentiment.llm.enabled` is false — no new code required.

## Validation note

`phase6-validation-matrix` uses `mockSentiment: true`, so **LLM on/off does not affect** that comparison; real-signal re-validation is a stretch goal (fixture seed + `mockSentiment: false`).
