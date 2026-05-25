# Crypto News Auto-Trader — Win Rate Improvement

## What This Is

A Node.js CLI bot that trades Binance USDⓈ-M Futures from crypto RSS news sentiment, technical MTF strategy (Elliott/Fib), and risk-managed execution in `sim`, `backtest`, `testnet`, and `live` modes. This planning cycle focused on **raising per-entry win rate** through research, backtest matrices, entry gates, and manual trade review—without abandoning the existing pipeline.

## Core Value

**Every taken entry should have a demonstrably stronger setup**—validated through research, backtest comparison, and human review of trades in SQLite/logs—before changes ship to all execution modes.

## Requirements

### Validated (planning cycle complete)

- ✓ **Entry baseline (Phase 1):** Entry path map, baseline backtest, trade export template
- ✓ **Experiment framework (Phase 2):** Matrix runner, per-run reports, comparison artifacts
- ✓ **Sentiment research (Phase 3):** `llm.enabled: false` production preset
- ✓ **MTF research (Phase 4):** `zoneTolerancePercent: 0.02`
- ✓ **Symbol expansion (Phase 5):** BTC, ETH, SOL, BNB, XRP in production config
- ✓ **Entry quality gates (Phase 6):** `EntryGate`; ~47 trades / 25.5% win vs pre-research 50 / 24% on validation matrix
- ✓ **Risk & exit tuning (Phase 7):** `SymbolCooldownTracker`; baseline risk wins matrix; `analyze-backtest-losses`
- ✓ **Trade review workflow (Phase 8):** `export-trade-review`, `exitReason`, optional `gateRejects`
- ✓ **Mode parity (Phase 9):** `paper-trading-stack`, determinism + testnet smoke tests
- ✓ **Rollout & docs (Phase 10):** `config/production.yaml`, `LIVE-SAFETY-CHECKLIST.md`, README operator section
- ✓ RSS ingest, sentiment, MTF strategy, risk engine, execution adapters, CLI — existing stack

### Active (ongoing operations, not planning)

- [ ] **Testnet validation:** Run ≥1 week with `CONFIG_PATH=./config/production.yaml`; export & review trades
- [ ] **Live promotion:** Only after checklist + explicit `allowLive: true`

### Out of Scope

- Web UI or dashboard — operator uses CLI, logs, and SQLite
- New exchanges or spot markets — Binance USDⓈ-M Futures only
- Custom ML model training — may use existing LLM gateway, not new models
- Guaranteed live profitability — research and testnet/sim proof first

## Context

**Brownfield baseline** (see `.planning/codebase/`):

- Event-driven monolith: RSS → sentiment → strategy → risk → execution
- Production timeframes: context `1d` / entry `4h`
- Success judged by **manual trade review**, not a single automated KPI
- `allowLive: false` by default (Phase 10); see `docs/LIVE-SAFETY-CHECKLIST.md`

## Constraints

- **Stack:** Node.js 20+, TypeScript, existing module layout
- **Exchange:** Binance Futures only; API keys via `.env`
- **Execution modes:** Validate in sim, backtest, testnet before live

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Research-first | Avoid guessing thresholds | Phases 1–5 baselines + matrices |
| Manual trade review | User-selected success metric | Phase 8 export workflow |
| Sentiment preset | Cost/latency vs precision | `llm.enabled: false` |
| MTF preset | Phase 4/6 matrix | `zoneTolerancePercent: 0.02` |
| Symbol universe | User request | 5 symbols in production |
| EntryGate | Phase 6 | Enabled in production |
| Risk cooldown | Phase 7 matrix | Default **off** (baseline wins) |
| Live safety | Phase 9–10 | `allowLive: false` + checklist |

---
*Last updated: 2026-05-25 — planning cycle complete (Phase 10)*
