# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Every taken entry should have a demonstrably stronger setup—validated through research, backtest comparison, and human review of trades.
**Current focus:** Phase 8 — Trade Review Workflow

## Current Position

Phase: 8 of 10 (Trade Review Workflow)
Plan: Not started
Status: Phase 7 complete
Last activity: 2026-05-25 — Phase 7 executed

Progress: ███████░░░ ~70%

## Performance Metrics

**Velocity:**
- Total plans completed: 43 (roadmap Phase 7 = 6 work packages)
- By phase: P1=5, P2=6, P3=6, P4=7, P5=5, P6=8, P7=6

**By Phase:**

| Phase | Status |
|-------|--------|
| 1–6 | Complete |
| 7. Risk & Exit Tuning | Complete |
| 8. Trade Review Workflow | Planned |

## Accumulated Context

### Decisions

- Phase 7 production: keep Phase 6 risk/Fib exits; `cooldownAfterLoss.enabled: false` by default
- Fib `targetExtension: 2.0` improves PnL but lowers win rate — experiment only (`risk-fib-tp-2.yaml`)
- ATR SL/TP multipliers ineffective when MTF attaches Fib SL/TP to every intent
- Worst mock PnL symbols: BNBUSDT, XRPUSDT (see `RISK-AUDIT.md`)

### Deferred Issues

- Per-symbol position sizing overrides for alts — operator tuning, not merged
- LLM on/off backtest still needs live API path

### Pending Todos

None.

## Session Continuity

Last session: 2026-05-25
Stopped at: Phase 7 execution complete
Resume file: None
