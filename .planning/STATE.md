# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Every taken entry should have a demonstrably stronger setup—validated through research, backtest comparison, and human review of trades.
**Current focus:** Phase 4 — MTF Entry Alignment Research

## Current Position

Phase: 4 of 10 (MTF Entry Alignment Research)
Plan: 04-01 of 7 (plans written)
Status: Ready to execute
Last activity: 2026-05-25 — Phase 4 planned (7 PLAN.md files)

Progress: ███░░░░░░░ ~30%

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- By phase: P1=5, P2=6, P3=6

**By Phase:**

| Phase | Plans | Total | Status |
|-------|-------|-------|--------|
| 1. Entry Baseline | 5 | 5 | Complete |
| 2. Backtest Experiments | 6 | 6 | Complete |
| 3. Sentiment Filters | 6 | 6 | Complete |
| 4. MTF Entry Alignment | 7 | 7 | Planned |

## Accumulated Context

### Decisions

- Experiment harness: `npm run backtest-matrix -- --matrix config/experiments/matrix.yaml`
- Mock matrix: sentiment-only YAML changes show **no diff** until real `news_signals` used
- Phase 1 baseline winRate **0.32** (25 trades, Oct–Dec 2024, mock sentiment)
- Phase 3 sentiment matrix: **2 trades, 0% win** on fixture-seeded real signals (all presets identical)
- Recommended preset: `sentiment-recommended.yaml` (`llm.enabled: false`)

### Deferred Issues

- LLM on/off backtest needs `OPENROUTER_API_KEY` + LLM-aware ingest
- `minStrength` 0.65 not differentiated on current fixtures — re-test with live RSS
- Pre-existing integration test failures unrelated to Phase 2 (rss/llm pipeline)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 4 primary matrix must use `mockSentiment: true` (see MTF-EXPERIMENT-GRID.md)
- Phase 3 real-signal runs (2 trades) are not comparable to mock MTF baseline (25 trades)

## Session Continuity

Last session: 2026-05-25
Stopped at: Phase 3 execution complete
Resume file: None
