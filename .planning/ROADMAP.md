# Roadmap: Crypto News Auto-Trader — Win Rate Improvement

## Overview

Improve per-entry win rate on the existing news→sentiment→MTF→risk→execution pipeline by establishing measurable baselines, running structured backtest experiments on filters, expanding to SOL/BNB/XRP, implementing evidence-based entry gates, and validating across sim/backtest/testnet before any live reliance. Success is judged primarily through manual trade review, not a single automated KPI.

## Domain Expertise

None (trading bot on established Node/TS stack; patterns documented in `.planning/codebase/`)

## Phases

- [x] **Phase 1: Entry Baseline & Observability** — Map the live entry path and capture baseline trade/backtest metrics
- [x] **Phase 2: Backtest Experiment Framework** — Runnable matrix to compare configs reproducibly
- [ ] **Phase 3: Sentiment Filter Research** — Threshold and LLM-gate experiments from data
- [ ] **Phase 4: MTF Entry Alignment Research** — Technical confirm and alignment experiments
- [ ] **Phase 5: Symbol Expansion** — Add SOLUSDT, BNBUSDT, XRPUSDT end-to-end
- [ ] **Phase 6: Entry Quality Gates** — Ship winning filters in code/config
- [ ] **Phase 7: Risk & Exit Tuning** — SL/TP, cooldown, per-symbol position rules
- [ ] **Phase 8: Trade Review Workflow** — Export and structured fields for manual review
- [ ] **Phase 9: Mode Parity Validation** — sim / backtest / testnet consistency checks
- [ ] **Phase 10: Rollout & Documentation** — Operator docs, safety checklist, config guidance

## Phase Details

### Phase 1: Entry Baseline & Observability
**Goal**: Document every condition that fires an entry today; run baseline backtest(s) on BTC/ETH; record win rate, trade count, and failure modes for review.
**Depends on**: Nothing (first phase)
**Research**: Unlikely (internal codebase already mapped in `.planning/codebase/`)
**Plans**: 5 plans

Plans:
- [x] 01-01: Trace entry path (news → sentiment → strategy → risk → adapter) with file references
- [x] 01-02: Define baseline metrics schema for manual review (fields in DB/logs)
- [x] 01-03: Run baseline backtest on existing kline fixtures / default config
- [x] 01-04: Export sample trades from SQLite for review template
- [x] 01-05: Summarize baseline findings in phase NOTES

### Phase 2: Backtest Experiment Framework
**Goal**: Make filter/config comparisons repeatable (script or CLI flags + result artifacts).
**Depends on**: Phase 1
**Research**: Likely (experiment design, metric aggregation)
**Research topics**: Backtest CLI capabilities (`src/cli/commands/backtest.ts`), fixture coverage, how to log per-run config hash and results
**Plans**: 6 plans

Plans:
- [x] 02-01: Inventory backtest inputs/outputs and gaps
- [x] 02-02: Config variant runner (YAML presets or env overrides)
- [x] 02-03: Per-run summary output (JSON/MD) for comparison
- [x] 02-04: Document experiment protocol for later phases
- [x] 02-05: Unit/smoke tests for experiment harness
- [x] 02-06: Phase summary with how to run matrix

### Phase 3: Sentiment Filter Research
**Goal**: Quantify which sentiment thresholds (`minStrength`, `thresholdLLM`, keywords) improve entry quality without arbitrary tuning.
**Depends on**: Phase 2
**Research**: Likely (rule + optional LLM interaction)
**Research topics**: False positives from RSS, LLM cost/latency vs precision, rule-scorer edge cases (`src/sentiment/rule-scorer.ts`)
**Plans**: 6 plans

Plans:
- [x] 03-01: Define sentiment experiment grid (configs to test)
- [x] 03-02: Run grid on BTC/ETH baseline period
- [x] 03-03: Analyze false signal patterns (manual review sample)
- [x] 03-04: LLM on/off comparison if enabled
- [x] 03-05: Recommend default sentiment preset
- [x] 03-06: Document findings for Phase 6

### Phase 4: MTF Entry Alignment Research
**Goal**: Test MTF/Elliott/Fib/swing constraints that improve entries (timing vs noise).
**Depends on**: Phase 2
**Research**: Likely (strategy parameters, timeframe pairs)
**Research topics**: `mtf-engine.ts`, `strategy-engine.ts`, timeframe config in `config/default.yaml`, confirm rules not yet in code
**Plans**: 7 plans

Plans:
- [x] 04-01: Document current MTF entry rules and gaps
- [x] 04-02: Hypothesis list (alignment strictness, pending signals, etc.)
- [x] 04-03: Backtest experiments per hypothesis
- [x] 04-04: Compare context/entry timeframe variants if needed
- [x] 04-05: Manual review of worst/best trades from samples
- [x] 04-06: Recommend technical gate preset
- [x] 04-07: Handoff doc for Phase 6

### Phase 5: Symbol Expansion
**Goal**: Add SOLUSDT, BNBUSDT, XRPUSDT to symbols, symbol mapper, and kline data paths.
**Depends on**: Phase 1 (baseline understanding); can parallelize after Phase 2 starts
**Research**: Unlikely (same Binance Futures patterns as BTC/ETH)
**Plans**: 5 plans

Plans:
- [x] 05-01: Update `config/default.yaml` and Zod schema if needed
- [x] 05-02: Extend `symbol-mapper` / RSS tagging for new symbols
- [x] 05-03: Fetch or add kline fixtures for new symbols
- [x] 05-04: Smoke test market WS/REST for new symbols (testnet/sim)
- [x] 05-05: Re-run baseline backtest with expanded universe

### Phase 6: Entry Quality Gates
**Goal**: Implement research-backed gates (sentiment + MTF + optional cooldown) in strategy/sentiment layers.
**Depends on**: Phases 3, 4, 5
**Research**: Unlikely (implementation from prior research)
**Plans**: 8 plans

Plans:
- [ ] 06-01: Design gate interface (single place to veto intents)
- [ ] 06-02: Implement sentiment gates from Phase 3 preset
- [ ] 06-03: Implement MTF/technical gates from Phase 4 preset
- [ ] 06-04: Config surface for gates (YAML + schema)
- [ ] 06-05: Unit tests for veto paths
- [ ] 06-06: Integration test intent → plan with gates on
- [ ] 06-07: Backtest validation vs baseline
- [ ] 06-08: Update PROJECT.md validated requirements

### Phase 7: Risk & Exit Tuning
**Goal**: Tune SL/TP, position limits, and per-symbol cooldown to protect win rate after entry.
**Depends on**: Phase 6
**Research**: Unlikely (internal risk engine); optional Likely if ATR multipliers need literature
**Research topics**: `risk-engine.ts`, `sl-tp-calculator.ts`, margin settings interaction
**Plans**: 6 plans

Plans:
- [ ] 07-01: Audit current risk behavior on losing trades
- [ ] 07-02: Experiment SL/TP multipliers via backtest framework
- [ ] 07-03: Per-symbol cooldown / max open positions
- [ ] 07-04: Implement chosen risk rules
- [ ] 07-05: Tests for risk edge cases
- [ ] 07-06: Backtest + manual review sample

### Phase 8: Trade Review Workflow
**Goal**: Operator can export and review trades with enough context to judge win-rate improvement.
**Depends on**: Phase 1, Phase 6
**Research**: Unlikely (SQLite + CLI)
**Plans**: 5 plans

Plans:
- [ ] 08-01: Define review checklist (fields: news id, signal, intent, fills, PnL)
- [ ] 08-02: CLI command or script to export trades (CSV/JSON)
- [ ] 08-03: Enrich trade records with gate veto reasons if applicable
- [ ] 08-04: README section for review process
- [ ] 08-05: Pilot review on baseline vs new gates dataset

### Phase 9: Mode Parity Validation
**Goal**: Prove gate/risk changes behave consistently in sim, backtest replay, and testnet.
**Depends on**: Phases 6, 7, 8
**Research**: Likely (testnet behavior, adapter differences)
**Research topics**: `adapter-factory.ts`, sim vs `backtest-replayer.ts` vs testnet adapters
**Plans**: 6 plans

Plans:
- [ ] 09-01: Parity test matrix (same config, three modes)
- [ ] 09-02: Fix divergences found in sim vs backtest
- [ ] 09-03: Testnet smoke run (no live)
- [ ] 09-04: Document known mode differences
- [ ] 09-05: Integration tests where feasible
- [ ] 09-06: Sign-off criteria for “ready beyond testnet”

### Phase 10: Rollout & Documentation
**Goal**: Consolidate presets, operator docs, and live-safety checklist; update PROJECT/STATE.
**Depends on**: Phase 9
**Research**: Unlikely
**Plans**: 4 plans

Plans:
- [ ] 10-01: Recommended production config profile (YAML)
- [ ] 10-02: README + config comments for win-rate settings
- [ ] 10-03: Live safety checklist (`allowLive`, keys, review cadence)
- [ ] 10-04: Milestone summary and move requirements in PROJECT.md

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
(Phase 5 may start after Phase 2 in parallel if resourcing allows; Phase 6 waits for 3+4 findings.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Entry Baseline | 5/5 | Complete | 2026-05-25 |
| 2. Backtest Experiments | 6/6 | Complete | 2026-05-25 |
| 3. Sentiment Filters | 0/6 | Not started | - |
| 4. MTF Alignment | 0/7 | Not started | - |
| 5. Symbol Expansion | 0/5 | Not started | - |
| 6. Entry Quality Gates | 0/8 | Not started | - |
| 7. Risk & Exit Tuning | 0/6 | Not started | - |
| 8. Trade Review Workflow | 0/5 | Not started | - |
| 9. Mode Parity | 0/6 | Not started | - |
| 10. Rollout & Docs | 0/4 | Not started | - |

**Total plans:** 57
