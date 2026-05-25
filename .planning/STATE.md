# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Every taken entry should have a demonstrably stronger setup—validated through research, backtest comparison, and human review of trades.
**Current focus:** Phase 2 — Backtest Experiment Framework

## Current Position

Phase: 2 of 10 (Backtest Experiment Framework)
Plan: 02-01 of 6 (plans written)
Status: Ready to execute
Last activity: 2026-05-25 — Phase 2 planned (6 PLAN.md files)

Progress: █░░░░░░░░░ ~10%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Entry Baseline | 5 | 5 | — |

**Recent Trend:**
- Last 5 plans: Phase 1 batch
- Trend: —

## Accumulated Context

### Decisions

- Phase 1: Mock-sentiment baseline winRate **0.32** (25 trades, Oct–Dec 2024) — beat via MTF/sentiment research
- Phase 1: Manual `would_take_again` is primary metric; export via `npm run export-trades-review`
- Phase 1: Backtest does not persist trades to SQLite yet

### Deferred Issues

- Real-sentiment backtest needs `news_signals` in DB or Phase 2 harness
- Populate trade export sample via `start --mode sim`

### Pending Todos

None yet.

### Blockers/Concerns

- `allowLive: true` in config — Phase 10

## Session Continuity

Last session: 2026-05-25
Stopped at: Phase 1 execution complete
Resume file: None
