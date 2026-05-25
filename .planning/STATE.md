# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Every taken entry should have a demonstrably stronger setup—validated through research, backtest comparison, and human review of trades.
**Current focus:** Phase 7 — Risk & Exit Tuning

## Current Position

Phase: 7 of 10 (Risk & Exit Tuning)
Plan: Not started
Status: Phase 6 complete
Last activity: 2026-05-25 — Phase 6 executed (8 plans)

Progress: ██████░░░░ ~60%

## Performance Metrics

**Velocity:**
- Total plans completed: 37
- By phase: P1=5, P2=6, P3=6, P4=7, P5=5, P6=8

**By Phase:**

| Phase | Plans | Total | Status |
|-------|-------|-------|--------|
| 1. Entry Baseline | 5 | 5 | Complete |
| 2. Backtest Experiments | 6 | 6 | Complete |
| 3. Sentiment Filters | 6 | 6 | Complete |
| 4. MTF Entry Alignment | 7 | 7 | Complete |
| 5. Symbol Expansion | 5 | 5 | Complete |
| 6. Entry Quality Gates | 8 | 8 | Complete |
| 7. Risk & Exit Tuning | 6 | 6 | Planned |

## Accumulated Context

### Decisions

- Experiment harness: `npm run backtest-matrix -- --matrix config/experiments/matrix.yaml`
- Phase 6 production: `config/default.yaml` — LLM off, fib 0.02, 5 symbols, `entryGates.enabled: true`
- Phase 6 validation (mock): production 47 trades / 25.5% vs pre-research 50 / 24.0%
- Phase 4 MTF winner: `zoneTolerancePercent: 0.02` — now in production default
- Phase 3 sentiment: `llm.enabled: false` — now in production default

### Deferred Issues

- LLM on/off backtest needs `OPENROUTER_API_KEY` + LLM-aware ingest
- Per-symbol cooldown after loss → Phase 7
- Pre-existing integration test failures unrelated to Phase 2 (rss/llm pipeline)

### Pending Todos

None.

### Blockers/Concerns

None for Phase 7 start.

## Session Continuity

Last session: 2026-05-25
Stopped at: Phase 6 execution complete
Resume file: None
